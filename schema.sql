-- SQL Schema for 'users' table
CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY,
    username TEXT,
    balance BIGINT DEFAULT 0,
    owner_id BIGINT REFERENCES users(telegram_id),
    current_price BIGINT DEFAULT 50,
    base_income BIGINT DEFAULT 0,
    level INTEGER DEFAULT 1, -- Max 20
    ghost_until TIMESTAMP WITH TIME ZONE,
    no_commission BOOLEAN DEFAULT FALSE,
    on_market BOOLEAN DEFAULT FALSE,
    market_price BIGINT,
    market_slots_unlocked INTEGER DEFAULT 1,
    last_collect_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_free_spin TIMESTAMP WITH TIME ZONE,
    photo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Marketplace listings table
CREATE TABLE IF NOT EXISTS market_listings (
    id SERIAL PRIMARY KEY,
    seller_id BIGINT REFERENCES users(telegram_id),
    slave_id BIGINT REFERENCES users(telegram_id),
    price BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(slave_id)
);

-- Global state for jackpot
CREATE TABLE IF NOT EXISTS globals (
    key TEXT PRIMARY KEY,
    value_int BIGINT DEFAULT 0
);

INSERT INTO globals (key, value_int) VALUES ('jackpot_fund', 10000) ON CONFLICT DO NOTHING;

-- RPC for purchasing a user (updated for self-buyout and commission)
CREATE OR REPLACE FUNCTION purchase_user(
    buyer_id BIGINT,
    target_id BIGINT
) RETURNS JSON AS $$
DECLARE
    target_user RECORD;
    buyer_user RECORD;
    prev_owner_id BIGINT;
    price BIGINT;
    cost BIGINT;
    owner_payout BIGINT;
BEGIN
    SELECT * INTO target_user FROM users WHERE telegram_id = target_id;
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Target user not found'); END IF;

    -- Check Ghost Mode
    IF target_user.ghost_until > CURRENT_TIMESTAMP THEN
        RETURN json_build_object('success', false, 'message', 'Пользователь под защитой (Ghost Mode)');
    END IF;

    SELECT * INTO buyer_user FROM users WHERE telegram_id = buyer_id;
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Buyer not found'); END IF;

    price := target_user.current_price;
    
    -- Self-buyout logic
    IF buyer_id = target_id THEN
        cost := floor(price * 1.25);
    ELSE
        cost := price;
    END IF;

    IF buyer_user.balance < cost THEN
        RETURN json_build_object('success', false, 'message', 'Недостаточно средств');
    END IF;

    -- Deduct cost
    UPDATE users SET balance = balance - cost WHERE telegram_id = buyer_id;

    -- Owner payout (Price - 5% commission unless no_commission)
    prev_owner_id := target_user.owner_id;
    IF prev_owner_id IS NOT NULL THEN
        IF (SELECT no_commission FROM users WHERE telegram_id = prev_owner_id) THEN
            owner_payout := price;
        ELSE
            owner_payout := floor(price * 0.95);
        END IF;
        UPDATE users SET balance = balance + owner_payout WHERE telegram_id = prev_owner_id;
    END IF;

    -- Clear market status if bought
    UPDATE users SET on_market = FALSE, market_price = NULL WHERE telegram_id = target_id;
    DELETE FROM market_listings WHERE slave_id = target_id;

    -- Change owner and increase price
    UPDATE users 
    SET owner_id = buyer_id, 
        current_price = floor(current_price * 1.2) 
    WHERE telegram_id = target_id;

    RETURN json_build_object('success', true, 'new_balance', buyer_user.balance - cost);
END;
$$ LANGUAGE plpgsql;

-- RPC for upgrading user level (Buyer pays for Target)
CREATE OR REPLACE FUNCTION upgrade_user(
    buyer_id BIGINT,
    target_id BIGINT
) RETURNS JSON AS $$
DECLARE
    target_u RECORD;
    buyer_u RECORD;
    cost BIGINT;
BEGIN
    SELECT * INTO target_u FROM users WHERE telegram_id = target_id;
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Target not found'); END IF;
    IF target_u.level >= 20 THEN RETURN json_build_object('success', false, 'message', 'Максимальный уровень достигнут'); END IF;

    SELECT * INTO buyer_u FROM users WHERE telegram_id = buyer_id;
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Buyer not found'); END IF;

    cost := floor(target_u.current_price * 1.6);
    IF buyer_u.balance < cost THEN RETURN json_build_object('success', false, 'message', 'Недостаточно средств'); END IF;

    -- Deduct from buyer
    UPDATE users SET balance = balance - cost WHERE telegram_id = buyer_id;

    -- Upgrade target
    UPDATE users 
    SET level = level + 1,
        base_income = floor(base_income * 1.5) + 2,
        current_price = floor(current_price * 1.6)
    WHERE telegram_id = target_id;

    RETURN json_build_object('success', true, 'new_level', target_u.level + 1);
END;
$$ LANGUAGE plpgsql;

-- RPC for selling a slave
CREATE OR REPLACE FUNCTION sell_slave(
    owner_id BIGINT,
    slave_id BIGINT
) RETURNS JSON AS $$
DECLARE
    s RECORD;
    payout BIGINT;
BEGIN
    SELECT * INTO s FROM users WHERE users.telegram_id = sell_slave.slave_id AND users.owner_id = sell_slave.owner_id;
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Slave not found or not owned'); END IF;

    payout := floor(s.current_price * 0.8);
    
    UPDATE users SET balance = balance + payout WHERE users.telegram_id = sell_slave.owner_id;
    UPDATE users SET owner_id = NULL WHERE users.telegram_id = sell_slave.slave_id;

    RETURN json_build_object('success', true, 'payout', payout);
END;
$$ LANGUAGE plpgsql;

-- RPC for listing a slave on market
CREATE OR REPLACE FUNCTION list_on_market(
    seller_id BIGINT,
    slave_id BIGINT,
    price BIGINT
) RETURNS JSON AS $$
DECLARE
    listing_count INTEGER;
    slots_unlocked INTEGER;
    u RECORD;
BEGIN
    -- Check ownership
    IF NOT EXISTS (SELECT 1 FROM users WHERE telegram_id = list_on_market.slave_id AND owner_id = list_on_market.seller_id) THEN
        RETURN json_build_object('success', false, 'message', 'Вы не владелец этого раба');
    END IF;

    SELECT COUNT(*), (SELECT market_slots_unlocked FROM users WHERE telegram_id = list_on_market.seller_id) 
    INTO listing_count, slots_unlocked 
    FROM market_listings WHERE market_listings.seller_id = list_on_market.seller_id;
    
    -- If trying to use a locked slot
    IF listing_count >= slots_unlocked THEN
        -- Special case: Auto-buy 2nd slot for 1000 coins if they have 1 slot and try to list 2nd
        IF slots_unlocked = 1 AND listing_count = 1 THEN
            SELECT balance INTO u FROM users WHERE telegram_id = list_on_market.seller_id;
            IF u.balance < 1000 THEN
                RETURN json_build_object('success', false, 'message', 'Недостаточно монет для разблокировки 2-го слота (нужно 1000)');
            END IF;
            -- Deduct and unlock
            UPDATE users SET balance = balance - 1000, market_slots_unlocked = 2 WHERE telegram_id = list_on_market.seller_id;
            slots_unlocked := 2;
        ELSE
            RETURN json_build_object('success', false, 'message', 'Нет свободных слотов. Разблокируйте новые слоты в магазине!');
        END IF;
    END IF;

    INSERT INTO market_listings (seller_id, slave_id, price)
    VALUES (list_on_market.seller_id, list_on_market.slave_id, list_on_market.price)
    ON CONFLICT (slave_id) DO UPDATE SET price = EXCLUDED.price;

    UPDATE users SET on_market = TRUE, market_price = list_on_market.price WHERE telegram_id = list_on_market.slave_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- RPC for unlisting from market
CREATE OR REPLACE FUNCTION unlist_from_market(
    seller_id BIGINT,
    slave_id BIGINT
) RETURNS JSON AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM market_listings WHERE market_listings.slave_id = unlist_from_market.slave_id AND market_listings.seller_id = unlist_from_market.seller_id) THEN
        RETURN json_build_object('success', false, 'message', 'Объявление не найдено');
    END IF;

    DELETE FROM market_listings WHERE market_listings.slave_id = unlist_from_market.slave_id;
    UPDATE users SET on_market = FALSE, market_price = NULL WHERE telegram_id = unlist_from_market.slave_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- RPC for buying from market
CREATE OR REPLACE FUNCTION buy_from_market(
    buyer_id BIGINT,
    slave_id BIGINT
) RETURNS JSON AS $$
DECLARE
    listing RECORD;
    buyer_u RECORD;
    seller_u RECORD;
    owner_payout BIGINT;
BEGIN
    SELECT * INTO listing FROM market_listings WHERE market_listings.slave_id = buy_from_market.slave_id;
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Объявление не найдено'); END IF;
    
    SELECT * INTO buyer_u FROM users WHERE users.telegram_id = buy_from_market.buyer_id;
    IF buyer_u.balance < listing.price THEN
        RETURN json_build_object('success', false, 'message', 'Недостаточно средств');
    END IF;

    -- Deduct from buyer
    UPDATE users SET balance = balance - listing.price WHERE users.telegram_id = buy_from_market.buyer_id;

    -- Payout to seller
    SELECT * INTO seller_u FROM users WHERE telegram_id = listing.seller_id;
    IF seller_u.no_commission THEN
        owner_payout := listing.price;
    ELSE
        owner_payout := floor(listing.price * 0.95);
    END IF;
    UPDATE users SET balance = balance + owner_payout WHERE telegram_id = listing.seller_id;

    -- Change owner and price
    UPDATE users 
    SET owner_id = buyer_id, 
        current_price = floor(current_price * 1.2),
        on_market = FALSE,
        market_price = NULL
    WHERE users.telegram_id = buy_from_market.slave_id;

    -- Remove listing
    DELETE FROM market_listings WHERE market_listings.slave_id = buy_from_market.slave_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- RPC for roulette spin
CREATE OR REPLACE FUNCTION spin_roulette(user_id_param BIGINT, bet_param INT, is_free BOOLEAN)
RETURNS JSON AS $$
DECLARE
    u_balance BIGINT;
    jackpot_current BIGINT;
    rand_val INT;
    segment_idx INT;
    multiplier DECIMAL;
    win_amt BIGINT;
    actual_bet BIGINT;
    final_balance BIGINT;
BEGIN
    -- 1. Определяем эффективную ставку
    IF is_free THEN
        actual_bet := 100;
    ELSE
        actual_bet := bet_param;
    END IF;

    -- 2. Берем текущий джекпот
    SELECT COALESCE((value->>0)::bigint, value_int) INTO jackpot_current FROM globals WHERE key = 'jackpot_fund';
    
    -- 3. Проверяем баланс и кулдаун
    SELECT balance INTO u_balance FROM users WHERE telegram_id = user_id_param;
    
    IF is_free THEN
        IF EXISTS (SELECT 1 FROM users WHERE telegram_id = user_id_param AND last_free_spin > NOW() - INTERVAL '1 day') THEN
            RETURN json_build_object('error', 'Бесплатный спин доступен раз в 24 часа');
        END IF;
    ELSE
        IF u_balance < actual_bet THEN
            RETURN json_build_object('error', 'Недостаточно средств');
        END IF;
    END IF;

    -- 4. Логика шансов и сегментов
    -- 0: JACKPOT (1%)
    -- 1, 4, 7: EMPTY (45%)
    -- 2: x0.5 (25%)
    -- 3: x2 (15%)
    -- 5: x10 (5%)
    -- 6: BONUS x2 (9%)
    
    rand_val := floor(random() * 100);
    
    IF rand_val < 1 THEN -- 1% Jackpot
        segment_idx := 0;
        multiplier := 0; -- Special case
        win_amt := jackpot_current;
        UPDATE globals SET value = '1000'::jsonb, value_int = 1000 WHERE key = 'jackpot_fund';
    ELSIF rand_val < 6 THEN -- 5% x10
        segment_idx := 5;
        multiplier := 10;
        win_amt := actual_bet * 10;
    ELSIF rand_val < 15 THEN -- 9% x2 (Previously Bonus)
        segment_idx := 6;
        multiplier := 2;
        win_amt := actual_bet * 2;
    ELSIF rand_val < 30 THEN -- 15% x2
        segment_idx := 3;
        multiplier := 2;
        win_amt := actual_bet * 2;
    ELSIF rand_val < 55 THEN -- 25% x0.5
        segment_idx := 2;
        multiplier := 0.5;
        win_amt := floor(actual_bet * 0.5);
    ELSE -- 45% Empty
        -- Pick one of 1, 4, 7
        rand_val := floor(random() * 3);
        IF rand_val = 0 THEN segment_idx := 1;
        ELSIF rand_val = 1 THEN segment_idx := 4;
        ELSE segment_idx := 7;
        END IF;
        multiplier := 0;
        win_amt := 0;
        
        IF NOT is_free THEN
            UPDATE globals SET 
                value = (jackpot_current + floor(actual_bet * 0.1))::text::jsonb,
                value_int = jackpot_current + floor(actual_bet * 0.1)
            WHERE key = 'jackpot_fund';
        END IF;
    END IF;

    -- 5. Обновляем пользователя
    UPDATE users 
    SET balance = balance - (CASE WHEN is_free THEN 0 ELSE actual_bet END) + win_amt,
        last_free_spin = (CASE WHEN is_free THEN NOW() ELSE last_free_spin END)
    WHERE telegram_id = user_id_param
    RETURNING balance INTO final_balance;

    RETURN json_build_object(
        'win_multiplier', multiplier,
        'segment_index', segment_idx,
        'new_balance', final_balance,
        'win_amount', win_amt,
        'type', CASE 
            WHEN segment_idx = 0 THEN 'jackpot'
            WHEN segment_idx IN (1, 4, 7) THEN 'empty'
            WHEN segment_idx = 2 THEN 'x0.5'
            WHEN segment_idx IN (3, 6) THEN 'x2'
            WHEN segment_idx = 5 THEN 'x10'
            ELSE 'empty'
        END
    );
END;
$$ LANGUAGE plpgsql;

-- RPC for rewarding inviter
CREATE OR REPLACE FUNCTION reward_inviter(
    inviter_id BIGINT
) RETURNS VOID AS $$
BEGIN
    UPDATE users SET balance = balance + 50 WHERE telegram_id = inviter_id;
END;
$$ LANGUAGE plpgsql;

-- RPC for leaderboard
CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
    telegram_id BIGINT,
    username TEXT,
    balance BIGINT,
    slaves_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.telegram_id, 
        u.username, 
        u.balance, 
        (SELECT COUNT(*) FROM users s WHERE s.owner_id = u.telegram_id) as slaves_count
    FROM users u
    ORDER BY u.balance DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;

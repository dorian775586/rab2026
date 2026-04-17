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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- New columns for shop items
    managers JSONB DEFAULT '{}'::jsonb, -- { "brigadier": 1, "smm": 0, ... }
    active_potions JSONB DEFAULT '{}'::jsonb, -- { "rage": "timestamp", "stealth": "timestamp" }
    has_rainbow_name BOOLEAN DEFAULT FALSE
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
    value_int BIGINT DEFAULT 0,
    value JSONB
);

-- Spin history for live feed
CREATE TABLE IF NOT EXISTS spin_history (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(telegram_id),
    username TEXT,
    bet BIGINT,
    win BIGINT,
    type TEXT, -- 'win', 'loss', 'jackpot'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    IF buyer_id = target_id THEN
        UPDATE users 
        SET owner_id = NULL, 
            current_price = floor(current_price * 1.2) 
        WHERE telegram_id = target_id;
    ELSE
        UPDATE users 
        SET owner_id = buyer_id, 
            current_price = floor(current_price * 1.2) 
        WHERE telegram_id = target_id;
    END IF;

    RETURN json_build_object('success', true, 'new_balance', (SELECT balance FROM users WHERE telegram_id = buyer_id));
END;
$$ LANGUAGE plpgsql;

-- Add personal_income column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='personal_income') THEN
        ALTER TABLE users ADD COLUMN personal_income BIGINT DEFAULT 1;
    END IF;
END $$;

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

    -- Upgrade target (base_income is income for owner)
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

-- RPC for listing on market
CREATE OR REPLACE FUNCTION list_on_market(
    seller_id_param BIGINT,
    slave_id_param BIGINT,
    price_param BIGINT
) RETURNS JSON AS $$
DECLARE
    listing_count INTEGER;
    slots_unlocked INTEGER;
BEGIN
    -- Проверяем владение, используя _param
    IF NOT EXISTS (SELECT 1 FROM users WHERE telegram_id = slave_id_param AND owner_id = seller_id_param) THEN
        RETURN json_build_object('success', false, 'message', 'Вы не владелец этого раба');
    END IF;

    -- Считаем слоты
    SELECT COUNT(*), (SELECT market_slots_unlocked FROM users WHERE telegram_id = seller_id_param) 
    INTO listing_count, slots_unlocked 
    FROM market_listings WHERE seller_id = seller_id_param;
    
    IF listing_count >= slots_unlocked THEN
        RETURN json_build_object('success', false, 'message', 'Нет свободных слотов');
    END IF;

    -- Вставляем данные
    INSERT INTO market_listings (seller_id, slave_id, price)
    VALUES (seller_id_param, slave_id_param, price_param)
    ON CONFLICT (slave_id) DO UPDATE SET price = EXCLUDED.price;

    -- Обновляем юзера
    UPDATE users SET on_market = TRUE, market_price = price_param 
    WHERE telegram_id = slave_id_param;

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
    buyer_id_param BIGINT,
    slave_id_param BIGINT
) RETURNS JSON AS $$
DECLARE
    listing RECORD;
    buyer_u RECORD;
    seller_u RECORD;
    owner_payout BIGINT;
BEGIN
    SELECT * INTO listing FROM market_listings WHERE market_listings.slave_id = slave_id_param;
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Объявление не найдено'); END IF;
    
    SELECT * INTO buyer_u FROM users WHERE users.telegram_id = buyer_id_param;
    IF buyer_u.balance < listing.price THEN
        RETURN json_build_object('success', false, 'message', 'Недостаточно средств');
    END IF;

    -- Deduct from buyer
    UPDATE users SET balance = balance - listing.price WHERE users.telegram_id = buyer_id_param;

    -- Payout to seller
    SELECT * INTO seller_u FROM users WHERE telegram_id = listing.seller_id;
    IF seller_u.no_commission THEN
        owner_payout := listing.price;
    ELSE
        owner_payout := floor(listing.price * 0.95);
    END IF;
    UPDATE users SET balance = balance + owner_payout WHERE telegram_id = listing.seller_id;

    -- Change owner and price
    IF buyer_id_param = slave_id_param THEN
        UPDATE users 
        SET owner_id = NULL, 
            current_price = floor(current_price * 1.2),
            on_market = FALSE,
            market_price = NULL
        WHERE users.telegram_id = slave_id_param;
    ELSE
        UPDATE users 
        SET owner_id = buyer_id_param, 
            current_price = floor(current_price * 1.2),
            on_market = FALSE,
            market_price = NULL
        WHERE users.telegram_id = slave_id_param;
    END IF;

    -- Remove listing
    DELETE FROM market_listings WHERE market_listings.slave_id = slave_id_param;

    RETURN json_build_object('success', true, 'new_balance', (SELECT balance FROM users WHERE telegram_id = buyer_id_param));
END;
$$ LANGUAGE plpgsql;

-- RPC for roulette spin
CREATE OR REPLACE FUNCTION spin_roulette(user_id_param BIGINT, bet_param INT, is_free BOOLEAN)
RETURNS JSON AS $$
DECLARE
    u_balance BIGINT;
    u_username TEXT;
    jackpot_current BIGINT;
    rand_val INT;
    segment_idx INT;
    multiplier DECIMAL;
    win_amt BIGINT;
    actual_bet BIGINT;
    final_balance BIGINT;
    res_type TEXT;
BEGIN
    -- 1. Определяем эффективную ставку
    IF is_free THEN
        actual_bet := 100;
    ELSE
        actual_bet := bet_param;
    END IF;

    -- 2. Берем текущий джекпот
    SELECT COALESCE(value_int, 0) INTO jackpot_current FROM globals WHERE key = 'jackpot_fund';
    
    -- 3. Проверяем баланс и кулдаун
    SELECT balance, username INTO u_balance, u_username FROM users WHERE telegram_id = user_id_param;
    
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
    rand_val := floor(random() * 100);
    
    IF rand_val < 1 THEN -- 1% Jackpot
        segment_idx := 0;
        multiplier := 0; 
        win_amt := jackpot_current;
        res_type := 'jackpot';
        UPDATE globals SET value_int = 1000 WHERE key = 'jackpot_fund';
    ELSIF rand_val < 5 THEN -- 4% x20
        segment_idx := 7;
        multiplier := 20;
        win_amt := actual_bet * 20;
        res_type := 'win';
    ELSIF rand_val < 10 THEN -- 5% x10
        segment_idx := 5;
        multiplier := 10;
        win_amt := actual_bet * 10;
        res_type := 'win';
    ELSIF rand_val < 18 THEN -- 8% x2 (Segment 6)
        segment_idx := 6;
        multiplier := 2;
        win_amt := actual_bet * 2;
        res_type := 'win';
    ELSIF rand_val < 26 THEN -- 8% x2 (Segment 3) -> Total x2 is 16%
        segment_idx := 3;
        multiplier := 2;
        win_amt := actual_bet * 2;
        res_type := 'win';
    ELSIF rand_val < 51 THEN -- 25% x0.5
        segment_idx := 2;
        multiplier := 0.5;
        win_amt := floor(actual_bet * 0.5);
        res_type := 'win';
    ELSE -- 49% ПУСТО (Segments 1, 4)
        rand_val := floor(random() * 2);
        IF rand_val = 0 THEN segment_idx := 1;
        ELSE segment_idx := 4;
        END IF;
        multiplier := 0;
        win_amt := 0;
        res_type := 'loss';
    END IF;

    -- Начисление в джекпот: разница между ставкой и выигрышем (если выигрыш меньше ставки)
    -- Это покрывает и проигрыш (win_amt = 0), и x0.5 (win_amt = 0.5 * bet)
    IF NOT is_free AND res_type != 'jackpot' AND win_amt < actual_bet THEN
        UPDATE globals SET value_int = value_int + (actual_bet - win_amt), value = NULL WHERE key = 'jackpot_fund';
    END IF;

    -- 5. Обновляем пользователя
    UPDATE users 
    SET balance = balance - (CASE WHEN is_free THEN 0 ELSE actual_bet END) + win_amt,
        last_free_spin = (CASE WHEN is_free THEN NOW() ELSE last_free_spin END)
    WHERE telegram_id = user_id_param
    RETURNING balance INTO final_balance;

    -- 6. Записываем в историю
    INSERT INTO spin_history (user_id, username, bet, win, type)
    VALUES (user_id_param, u_username, CASE WHEN is_free THEN 0 ELSE actual_bet END, win_amt, res_type);

    RETURN json_build_object(
        'win_multiplier', multiplier,
        'segment_index', segment_idx,
        'new_balance', final_balance,
        'win_amount', win_amt,
        'type', res_type,
        'success', true
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

-- Добавляем колонку photo_url если её нет
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Обновляем лидерборд для возврата радуги и фото
DROP FUNCTION IF EXISTS get_leaderboard();
CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
    telegram_id BIGINT,
    username TEXT,
    balance BIGINT,
    slaves_count BIGINT,
    has_rainbow_name BOOLEAN,
    photo_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.telegram_id, 
        u.username, 
        u.balance, 
        (SELECT COUNT(*) FROM users s WHERE s.owner_id = u.telegram_id) as slaves_count,
        u.has_rainbow_name,
        u.photo_url
    FROM users u
    ORDER BY u.balance DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;

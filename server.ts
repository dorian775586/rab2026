import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

async function getFullUser(telegramId: string) {
  const { data: user, error } = await supabase
    .from("users")
    .select("*, owner:owner_id(username)")
    .eq("telegram_id", telegramId)
    .single();

  if (error) throw error;

  const { data: allSlaves } = await supabase
    .from("users")
    .select("base_income, on_market")
    .eq("owner_id", telegramId);

  const slavesCount = allSlaves?.length || 0;
  const totalSlavesIncome = (allSlaves || []).reduce((acc, s) => acc + (s.base_income || 0), 0);
  
  let totalIncome = (user.personal_income || 1) + totalSlavesIncome;

  // Apply Manager Bonuses
  const managers = user.managers || {};
  const managerBonuses = {
    brigadier: 0.10,
    smm: 0.25,
    top_manager: 0.60,
    oligarch: 1.50
  };

  let totalMultiplier = 1.0;
  Object.entries(managers).forEach(([type, count]) => {
    const bonus = managerBonuses[type as keyof typeof managerBonuses];
    if (bonus) {
      totalMultiplier += bonus * (count as number);
    }
  });

  // Apply Potion Bonuses
  const activePotions = user.active_potions || {};
  const now = new Date().toISOString();
  if (activePotions.rage && activePotions.rage > now) {
    totalMultiplier += 0.50;
  }

  return {
    ...user,
    slaves_count: slavesCount,
    total_income: Math.floor(totalIncome * totalMultiplier)
  };
}

// Telegram Validation Middleware
const validateTelegram = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const initData = req.headers["x-telegram-init-data"] as string;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    // For development if token is not set, we might skip or log
    console.warn("TELEGRAM_BOT_TOKEN not set, skipping validation");
    return next();
  }

  if (!initData) {
    console.warn("Missing initData, using mock user for testing");
    (req as any).tgUser = { id: 623203896, username: "TestUser" }; // Используем ID из примера пользователя
    return next();
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    urlParams.delete("hash");

    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (hmac === hash) {
      // Parse user data from initData
      const userStr = urlParams.get("user");
      if (userStr) {
        (req as any).tgUser = JSON.parse(userStr);
      }
      
      if (!(req as any).tgUser) {
        return res.status(401).json({ success: false, message: "Пользователь не авторизован" });
      }
      
      next();
    } else {
      console.error("Invalid Telegram hash. Expected:", hash, "Got:", hmac);
      res.status(403).json({ success: false, message: "Неверные данные Telegram" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Ошибка валидации данных" });
  }
};

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Sync endpoint: Calculate passive income and return user state
app.post("/api/sync", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  if (!tgUser) return res.status(400).json({ success: false, message: "Пользователь не идентифицирован" });

  const { id, username, photo_url } = tgUser;
  const { referrerId } = req.body;
  const initData = req.headers["x-telegram-init-data"] as string;
  const urlParams = new URLSearchParams(initData);
  const startParam = urlParams.get("start_param");

  // Robust inviter ID extraction
  let inviterId: string | null = null;
  const rawInviter = startParam || referrerId;
  if (rawInviter && /^\d+$/.test(String(rawInviter))) {
    inviterId = String(rawInviter);
  }

  console.log(`[Sync] User: ${id} (${username}). Inviter from request: ${inviterId}`);

  try {
    // Get user from DB
    let { data: user, error } = await supabase
      .from("users")
      .select("*, owner:owner_id(username)")
      .eq("telegram_id", BigInt(id).toString())
      .maybeSingle();

    if (!user) {
      // User doesn't exist, create them
      console.log(`[Sync] Creating new user: ${id}`);
      
      // Don't allow self-referral
      if (inviterId === BigInt(id).toString()) {
        console.log("[Sync] Self-referral blocked");
        inviterId = null;
      }

      // Verify inviter exists in DB
      if (inviterId) {
        const { data: inviterData, error: inviterErr } = await supabase
          .from("users")
          .select("telegram_id, username")
          .eq("telegram_id", BigInt(inviterId).toString())
          .maybeSingle();
        
        if (!inviterData) {
          console.log(`[Sync] Inviter ${inviterId} NOT found in database. User will be free.`);
          inviterId = null;
        } else {
          console.log(`[Sync] Inviter ${inviterId} (${inviterData.username}) confirmed.`);
        }
      }

      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert([{ 
          telegram_id: BigInt(id).toString(), 
          username: username || `User_${id}`,
          photo_url: photo_url || null,
          owner_id: inviterId ? BigInt(inviterId).toString() : null,
          balance: 500, // Даем 500 монет новым игрокам для старта
          base_income: 0,
          current_price: 50
        }])
        .select("*, owner:owner_id(username)")
        .single();
      
      if (createError) {
        console.error("[Sync] Create user error:", createError);
        throw createError;
      }
      user = newUser;
      console.log(`[Sync] User ${id} created. Owner: ${inviterId || 'None'}`);

      // Reward inviter
      if (inviterId) {
        await supabase.rpc('reward_inviter', { inviter_id: BigInt(inviterId).toString() });
        console.log(`[Sync] Inviter ${inviterId} rewarded with bonus coins`);
      }
    } else if (error) {
      throw error;
    }

    // Calculate passive income
    const now = new Date();
    const lastCollect = new Date(user.last_collect_time);
    const diffMs = now.getTime() - lastCollect.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins > 0) {
      // Get sum of base_income from all active slaves
      const { data: slavesData, error: slavesError } = await supabase
        .from("users")
        .select("base_income")
        .eq("owner_id", BigInt(id).toString());

      if (slavesError) throw slavesError;

      const slavesIncome = (slavesData || []).reduce((acc, s) => acc + (s.base_income || 0), 0);
      const income = diffMins * ((user.personal_income || 1) + slavesIncome);
      
      await supabase
        .from("users")
        .update({ 
          balance: user.balance + income,
          last_collect_time: now.toISOString()
        })
        .eq("telegram_id", BigInt(id).toString());
    }

    const fullUser = await getFullUser(BigInt(id).toString());
    res.json(fullUser);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// New Endpoints
app.post("/api/upgrade", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { targetId } = req.body;
  try {
    const { data, error } = await supabase.rpc("upgrade_user", { 
      buyer_id: BigInt(tgUser.id).toString(),
      target_id: BigInt(targetId || tgUser.id).toString() 
    });
    if (error) throw error;
    
    // Fetch updated user to return to frontend
    const { data: updatedUser } = await supabase
      .from("users")
      .select("*, owner:owner_id(username)")
      .eq("telegram_id", BigInt(tgUser.id).toString())
      .single();

    res.json({ ...data, user: updatedUser });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/sell", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { slaveId } = req.body;
  try {
    const { data, error } = await supabase.rpc("sell_slave", { 
      owner_id: BigInt(tgUser.id).toString(), 
      slave_id: BigInt(slaveId).toString() 
    });
    if (error) throw error;
    
    // Fetch updated user
    const { data: updatedUser } = await supabase
      .from("users")
      .select("*, owner:owner_id(username)")
      .eq("telegram_id", BigInt(tgUser.id).toString())
      .single();
      
    res.json({ ...data, user: updatedUser });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/spin", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { bet, isFree } = req.body;
  
  console.log(`Spin request from ${tgUser.id}: bet=${bet}, isFree=${isFree}`);
  
  try {
    const { data, error } = await supabase.rpc("spin_roulette", { 
      user_id_param: BigInt(tgUser.id).toString(), 
      bet_param: Number(bet || 0),
      is_free: !!isFree 
    });
    
    if (error) {
      console.error("Spin RPC error:", error);
      throw error;
    }
    
    if (data && data.error) {
      return res.status(400).json({ success: false, message: data.error });
    }

    // Normalize response for frontend
    const result = {
      success: true,
      type: data.type || 'empty',
      win: data.win_amount || 0,
      segment: data.segment_index,
      newBalance: data.new_balance
    };
    
    console.log(`Spin result for ${tgUser.id}:`, result);
    res.json(result);
  } catch (err: any) {
    console.error("Spin endpoint error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/spin-history", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("spin_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/globals", async (req, res) => {
  try {
    const { data, error } = await supabase.from("globals").select("*");
    if (error) throw error;
    const globals = data.reduce((acc: any, curr: any) => {
      // Prefer JSONB 'value' if it exists and is not null, otherwise use 'value_int'
      if (curr.value !== null && curr.value !== undefined) {
        // If it's an array or object, try to get the first value or the value itself
        acc[curr.key] = typeof curr.value === 'object' ? (Array.isArray(curr.value) ? curr.value[0] : curr.value) : curr.value;
      } else {
        acc[curr.key] = curr.value_int;
      }
      return acc;
    }, {});
    
    if (globals.jackpot_fund === undefined) {
      await supabase.from("globals").insert({ key: "jackpot_fund", value_int: 10000 });
      globals.jackpot_fund = 10000;
    }
    
    res.json(globals);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/buy-ghost-short", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const { data: user } = await supabase.from("users").select("balance, base_income").eq("telegram_id", BigInt(tgUser.id).toString()).single();
    const cost = (user?.base_income || 0) * 20;
    
    if ((user?.balance || 0) < cost) {
      return res.status(400).json({ success: false, message: "Недостаточно средств" });
    }

    const ghostUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("users")
      .update({ 
        balance: (user?.balance || 0) - cost,
        ghost_until: ghostUntil 
      })
      .eq("telegram_id", BigInt(tgUser.id).toString());
    
    if (error) throw error;
    res.json({ success: true, ghost_until: ghostUntil });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/buy-ghost", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const ghostUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("users")
      .update({ ghost_until: ghostUntil })
      .eq("telegram_id", BigInt(tgUser.id).toString());
    if (error) throw error;
    res.json({ success: true, ghost_until: ghostUntil });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/buy-coins", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { amount } = req.body;
  try {
    const { data: user } = await supabase.from("users").select("balance").eq("telegram_id", BigInt(tgUser.id).toString()).single();
    const { error } = await supabase
      .from("users")
      .update({ balance: (user?.balance || 0) + amount })
      .eq("telegram_id", BigInt(tgUser.id).toString());
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Buy endpoint: Call the RPC function
app.post("/api/buy", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { targetId } = req.body;

  if (!tgUser || !targetId) return res.status(400).json({ success: false, message: "Неверный запрос" });

  try {
    const { data, error } = await supabase.rpc("purchase_user", {
      buyer_id: BigInt(tgUser.id).toString(),
      target_id: BigInt(targetId).toString()
    });

    if (error) throw error;
    
    if (data.success) {
      const fullUser = await getFullUser(BigInt(tgUser.id).toString());
      res.json({ ...data, user: fullUser });
    } else {
      res.status(400).json(data);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/shop/buy", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { itemType, itemId } = req.body;

  try {
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", BigInt(tgUser.id).toString())
      .single();

    if (fetchError) throw fetchError;

    let updateData: any = {};

    if (itemType === 'coins') {
      const coinPackages: Record<string, number> = {
        'handful': 5000,
        'bag': 50000,
        'treasury': 200000
      };
      const amount = coinPackages[itemId];
      if (amount) {
        updateData.balance = (user.balance || 0) + amount;
      }
    } else if (itemType === 'manager') {
      const managers = user.managers || {};
      managers[itemId] = (managers[itemId] || 0) + 1;
      updateData.managers = managers;
    } else if (itemType === 'potion') {
      const potions = user.active_potions || {};
      const duration = itemId === 'rage' ? 24 : 12;
      const expiry = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();
      potions[itemId] = expiry;
      updateData.active_potions = potions;
    } else if (itemType === 'extra' && itemId === 'rainbow') {
      updateData.has_rainbow_name = true;
    }

    const { error: updateError } = await supabase
      .from("users")
      .update(updateData)
      .eq("telegram_id", BigInt(tgUser.id).toString());

    if (updateError) throw updateError;

    const updatedUser = await getFullUser(BigInt(tgUser.id).toString());
    res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Market endpoints
app.get("/api/market", validateTelegram, async (req, res) => {
  const { sort } = req.query;
  try {
    let query = supabase
      .from("market_listings")
      .select("*, slave:slave_id(telegram_id, username, current_price, base_income, level, has_rainbow_name, photo_url)");

    if (sort === "cheap") query = query.order("price", { ascending: true });
    else if (sort === "expensive") query = query.order("price", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const { data, error } = await query.limit(50);
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/market/list", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { slaveId, price } = req.body;
  try {
    const { data, error } = await supabase.rpc("list_on_market", {
      seller_id_param: BigInt(tgUser.id).toString(),
      slave_id_param: BigInt(slaveId).toString(),
      price_param: Math.floor(Number(price))
    });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error("Market list error:", err);
    res.status(500).json({ success: false, message: err.message || "Ошибка сервера" });
  }
});

app.post("/api/market/buy", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { slaveId } = req.body;
  try {
    const { data, error } = await supabase.rpc("buy_from_market", {
      buyer_id: BigInt(tgUser.id).toString(),
      slave_id: BigInt(slaveId).toString()
    });
    if (error) throw error;
    
    if (data.success) {
      const fullUser = await getFullUser(BigInt(tgUser.id).toString());
      res.json({ ...data, user: fullUser });
    } else {
      res.status(400).json(data);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/market/unlist", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { slaveId } = req.body;
  try {
    const { data, error } = await supabase.rpc("unlist_from_market", {
      seller_id: BigInt(tgUser.id).toString(),
      slave_id: BigInt(slaveId).toString()
    });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/market/my-listings", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const { data, error } = await supabase
      .from("market_listings")
      .select("*, slave:slave_id(telegram_id, username, current_price, base_income, level)")
      .eq("seller_id", BigInt(tgUser.id).toString());
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/profile/:id", async (req, res) => {
  const targetId = BigInt(req.params.id).toString();
  
  try {
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("telegram_id, username, balance, current_price, base_income, level, ghost_until, has_rainbow_name, photo_url")
      .eq("telegram_id", targetId)
      .single();
    
    if (userError) throw userError;

    const { data: slaves, error: slavesError } = await supabase
      .from("users")
      .select("telegram_id, username, current_price, base_income, level, has_rainbow_name, photo_url")
      .eq("owner_id", targetId);
    
    if (slavesError) throw slavesError;

    res.json({ ...user, slaves });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/buy-premium", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const { error } = await supabase
      .from("users")
      .update({ no_commission: true })
      .eq("telegram_id", BigInt(tgUser.id).toString());
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// My Slaves endpoint (only those NOT on market)
app.post("/api/buy-slot", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("market_slots_unlocked, balance")
      .eq("telegram_id", BigInt(tgUser.id).toString())
      .single();
    
    if (fetchError) throw fetchError;
    if (user.market_slots_unlocked >= 20) {
      return res.status(400).json({ success: false, message: "Максимальное количество слотов достигнуто" });
    }
    if (user.balance < 1000) {
      return res.status(400).json({ success: false, message: "Недостаточно монет (нужно 1000)" });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ 
        market_slots_unlocked: user.market_slots_unlocked + 1,
        balance: user.balance - 1000
      })
      .eq("telegram_id", BigInt(tgUser.id).toString());
    
    if (updateError) throw updateError;

    // Fetch updated user
    const { data: updatedUser } = await supabase
      .from("users")
      .select("*, owner:owner_id(username)")
      .eq("telegram_id", BigInt(tgUser.id).toString())
      .single();

    res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/slaves", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const { data, error } = await supabase
      .from("users")
      .select("telegram_id, username, current_price, base_income, level, on_market, has_rainbow_name, photo_url")
      .eq("owner_id", BigInt(tgUser.id).toString());
    
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/leaderboard", validateTelegram, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc("get_leaderboard");
    if (error || !data || data.length === 0) {
      // Fallback to manual query if RPC fails or returns empty
      const { data: manualData, error: manualError } = await supabase
        .from("users")
        .select("telegram_id, username, balance, has_rainbow_name, photo_url")
        .order("balance", { ascending: false })
        .limit(100);
      
      if (manualError) throw manualError;
      
      // Add slaves count manually
      const leaderboardWithSlaves = await Promise.all((manualData || []).map(async (u: any) => {
        const { count } = await supabase
          .from("users")
          .select("*", { count: 'exact', head: true })
          .eq("owner_id", u.telegram_id);
        return { 
          telegram_id: u.telegram_id,
          username: u.username,
          balance: u.balance,
          slaves_count: count || 0,
          has_rainbow_name: u.has_rainbow_name,
          photo_url: u.photo_url
        };
      }));
      
      return res.json(leaderboardWithSlaves);
    }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

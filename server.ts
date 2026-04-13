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
      next();
    } else {
      console.error("Invalid Telegram hash. Expected:", hash, "Got:", hmac);
      res.status(403).json({ error: "Invalid Telegram data" });
    }
  } catch (err) {
    res.status(500).json({ error: "Validation failed" });
  }
};

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Sync endpoint: Calculate passive income and return user state
app.post("/api/sync", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  if (!tgUser) return res.status(400).json({ error: "User not identified" });

  const { id, username } = tgUser;
  const { referrerId } = req.body;
  const initData = req.headers["x-telegram-init-data"] as string;
  const urlParams = new URLSearchParams(initData);
  const startParam = urlParams.get("start_param");

  try {
    // Get user from DB
    let { data: user, error } = await supabase
      .from("users")
      .select("*, owner:owner_id(username)")
      .eq("telegram_id", String(id))
      .single();

    if (error && error.code === "PGRST116") {
      // User doesn't exist, create them
      let inviterId: string | null = null;
      if (startParam && !isNaN(Number(startParam))) {
        inviterId = String(startParam);
      } else if (referrerId && !isNaN(Number(referrerId))) {
        inviterId = String(referrerId);
      }

      // Проверяем, существует ли пригласитель на самом деле
      if (inviterId) {
        const { data: inviterExists } = await supabase
          .from("users")
          .select("telegram_id")
          .eq("telegram_id", inviterId)
          .single();
        
        if (!inviterExists) {
          inviterId = null; // Если его нет в базе, обнуляем, чтобы insert не упал
        }
      }

      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert([{ 
          telegram_id: String(id), 
          username: username || `User_${id}`,
          owner_id: inviterId,
          balance: 0,
          base_income: 0
        }])
        .select()
        .single();
      
      if (createError) throw createError;
      user = newUser;

      // Reward inviter
      if (inviterId) {
        await supabase.rpc('reward_inviter', { inviter_id: inviterId });
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
      // Get slaves count for additional income (only those NOT on market)
      const { count: activeSlavesCount } = await supabase
        .from("users")
        .select("*", { count: 'exact', head: true })
        .eq("owner_id", String(id))
        .eq("on_market", false);

      const income = diffMins * (user.base_income + (activeSlavesCount || 0));
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({ 
          balance: user.balance + income,
          last_collect_time: now.toISOString()
        })
        .eq("telegram_id", String(id))
        .select("*, owner:owner_id(username)")
        .single();
      
      if (updateError) throw updateError;
      user = updatedUser;
    }

    // Get slaves count for the response
    const { count: slavesCount } = await supabase
      .from("users")
      .select("*", { count: 'exact', head: true })
      .eq("owner_id", String(id));

    res.json({ ...user, slaves_count: slavesCount || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// New Endpoints
app.post("/api/upgrade", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { targetId } = req.body;
  try {
    const { data, error } = await supabase.rpc("upgrade_user", { 
      buyer_id: String(tgUser.id),
      target_id: String(targetId || tgUser.id) 
    });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sell", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { slaveId } = req.body;
  try {
    const { data, error } = await supabase.rpc("sell_slave", { owner_id: String(tgUser.id), slave_id: String(slaveId) });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/spin", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  let { bet, isFree } = req.body;
  try {
    if (isFree) {
      const { data: user } = await supabase.from("users").select("last_free_spin").eq("telegram_id", String(tgUser.id)).single();
      const lastFree = user?.last_free_spin ? new Date(user.last_free_spin) : new Date(0);
      const now = new Date();
      if (now.getTime() - lastFree.getTime() < 24 * 60 * 60 * 1000) {
        return res.status(400).json({ success: false, message: "Бесплатный спин доступен раз в 24 часа" });
      }
      bet = 100; // Free spin is always for 100 bet
      await supabase.from("users").update({ last_free_spin: now.toISOString() }).eq("telegram_id", String(tgUser.id));
    }

    const { data, error } = await supabase.rpc("spin_roulette", { user_id: String(tgUser.id), bet, is_free: isFree });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/globals", async (req, res) => {
  try {
    const { data, error } = await supabase.from("globals").select("*");
    if (error) throw error;
    const globals = data.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value_int;
      return acc;
    }, {});
    res.json(globals);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/buy-ghost-short", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const { data: user } = await supabase.from("users").select("balance, base_income").eq("telegram_id", String(tgUser.id)).single();
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
      .eq("telegram_id", String(tgUser.id));
    
    if (error) throw error;
    res.json({ success: true, ghost_until: ghostUntil });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/buy-ghost", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const ghostUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("users")
      .update({ ghost_until: ghostUntil })
      .eq("telegram_id", String(tgUser.id));
    if (error) throw error;
    res.json({ success: true, ghost_until: ghostUntil });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/buy-coins", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { amount } = req.body;
  try {
    const { data: user } = await supabase.from("users").select("balance").eq("telegram_id", String(tgUser.id)).single();
    const { error } = await supabase
      .from("users")
      .update({ balance: (user?.balance || 0) + amount })
      .eq("telegram_id", String(tgUser.id));
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Buy endpoint: Call the RPC function
app.post("/api/buy", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { targetId } = req.body;

  if (!tgUser || !targetId) return res.status(400).json({ error: "Invalid request" });

  try {
    const { data, error } = await supabase.rpc("purchase_user", {
      buyer_id: String(tgUser.id),
      target_id: String(targetId)
    });

    if (error) throw error;
    
    if (data.success) {
      res.json(data);
    } else {
      res.status(400).json(data);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Market endpoints
app.get("/api/market", validateTelegram, async (req, res) => {
  const { sort } = req.query;
  try {
    let query = supabase
      .from("market_listings")
      .select("*, slave:slave_id(telegram_id, username, current_price, base_income, level)");

    if (sort === "cheap") query = query.order("price", { ascending: true });
    else if (sort === "expensive") query = query.order("price", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const { data, error } = await query.limit(50);
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/market/list", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { slaveId, price } = req.body;
  try {
    const { data, error } = await supabase.rpc("list_on_market", {
      seller_id: String(tgUser.id),
      slave_id: String(slaveId),
      price
    });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/market/buy", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { slaveId } = req.body;
  try {
    const { data, error } = await supabase.rpc("buy_from_market", {
      buyer_id: String(tgUser.id),
      slave_id: String(slaveId)
    });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/market/unlist", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { slaveId } = req.body;
  try {
    const { data, error } = await supabase.rpc("unlist_from_market", {
      seller_id: String(tgUser.id),
      slave_id: String(slaveId)
    });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/market/my-listings", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const { data, error } = await supabase
      .from("market_listings")
      .select("*, slave:slave_id(telegram_id, username, current_price, base_income, level)")
      .eq("seller_id", String(tgUser.id));
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/profile/:id", async (req, res) => {
  const targetId = String(req.params.id); // Используем строку для BigInt
  
  try {
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("telegram_id, username, balance, current_price, base_income, level, ghost_until")
      .eq("telegram_id", targetId)
      .single();
    
    if (userError) throw userError;

    const { data: slaves, error: slavesError } = await supabase
      .from("users")
      .select("telegram_id, username, current_price, base_income, level")
      .eq("owner_id", targetId);
    
    if (slavesError) throw slavesError;

    res.json({ ...user, slaves });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/buy-premium", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const { error } = await supabase
      .from("users")
      .update({ no_commission: true })
      .eq("telegram_id", String(tgUser.id));
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// My Slaves endpoint (only those NOT on market)
app.post("/api/buy-slot", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("market_slots_unlocked")
      .eq("telegram_id", String(tgUser.id))
      .single();
    
    if (fetchError) throw fetchError;
    if (user.market_slots_unlocked >= 20) {
      return res.status(400).json({ success: false, message: "Максимальное количество слотов достигнуто" });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ market_slots_unlocked: user.market_slots_unlocked + 1 })
      .eq("telegram_id", String(tgUser.id));
    
    if (updateError) throw updateError;
    res.json({ success: true, market_slots_unlocked: user.market_slots_unlocked + 1 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/slaves", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const { data, error } = await supabase
      .from("users")
      .select("telegram_id, username, current_price, base_income, level, on_market")
      .eq("owner_id", String(tgUser.id));
    
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/leaderboard", validateTelegram, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc("get_leaderboard");
    if (error || !data || data.length === 0) {
      // Fallback to manual query if RPC fails or returns empty
      const { data: manualData, error: manualError } = await supabase
        .from("users")
        .select("telegram_id, username, balance")
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
          slaves_count: count || 0 
        };
      }));
      
      return res.json(leaderboardWithSlaves);
    }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

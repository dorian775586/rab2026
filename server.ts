import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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
    return res.status(401).json({ error: "Missing initData" });
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
  const initData = req.headers["x-telegram-init-data"] as string;
  const urlParams = new URLSearchParams(initData);
  const startParam = urlParams.get("start_param");

  try {
    // Get user from DB
    let { data: user, error } = await supabase
      .from("users")
      .select("*, owner:owner_id(username)")
      .eq("telegram_id", id)
      .single();

    if (error && error.code === "PGRST116") {
      // User doesn't exist, create them
      let inviterId: number | null = null;
      if (startParam && !isNaN(Number(startParam))) {
        inviterId = Number(startParam);
      }

      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert([{ 
          telegram_id: id, 
          username: username || `User_${id}`,
          owner_id: inviterId
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
      const income = diffMins * user.base_income;
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({ 
          balance: user.balance + income,
          last_collect_time: now.toISOString()
        })
        .eq("telegram_id", id)
        .select("*, owner:owner_id(username)")
        .single();
      
      if (updateError) throw updateError;
      user = updatedUser;
    }

    res.json(user);
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
      buyer_id: tgUser.id,
      target_id: targetId || tgUser.id 
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
    const { data, error } = await supabase.rpc("sell_slave", { owner_id: tgUser.id, slave_id: slaveId });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/spin", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  const { bet, isFree } = req.body;
  try {
    const { data, error } = await supabase.rpc("spin_roulette", { user_id: tgUser.id, bet, is_free: isFree });
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
    const { data: user } = await supabase.from("users").select("balance, base_income").eq("telegram_id", tgUser.id).single();
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
      .eq("telegram_id", tgUser.id);
    
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
      .eq("telegram_id", tgUser.id);
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
    const { data: user } = await supabase.from("users").select("balance").eq("telegram_id", tgUser.id).single();
    const { error } = await supabase
      .from("users")
      .update({ balance: (user?.balance || 0) + amount })
      .eq("telegram_id", tgUser.id);
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
      buyer_id: tgUser.id,
      target_id: targetId
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

// Market endpoint: List users to buy
app.get("/api/market", validateTelegram, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("telegram_id, username, current_price, base_income")
      .limit(50);
    
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// My Slaves endpoint
app.get("/api/slaves", validateTelegram, async (req, res) => {
  const tgUser = (req as any).tgUser;
  try {
    const { data, error } = await supabase
      .from("users")
      .select("telegram_id, username, current_price, base_income, level")
      .eq("owner_id", tgUser.id);
    
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/leaderboard", validateTelegram, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc("get_leaderboard");
    if (error) throw error;
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

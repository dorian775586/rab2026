/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, ReactNode } from 'react';
import WebApp from '@twa-dev/sdk';
import { 
  User, 
  Users, 
  ShoppingBag, 
  CheckSquare, 
  Coins, 
  TrendingUp, 
  Shield,
  Search,
  Loader2,
  Crown,
  Lock,
  ArrowRight,
  Zap,
  Plus,
  Dices,
  Store,
  RefreshCw,
  Trash2,
  Trophy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
interface UserData {
  telegram_id: number;
  username: string;
  balance: number;
  current_price: number;
  base_income: number;
  level: number;
  ghost_until: string | null;
  owner_id: number | null;
  owner?: { username: string };
  last_collect_time: string;
  last_free_spin: string | null;
}

interface MarketUser {
  telegram_id: number;
  username: string;
  current_price: number;
  base_income: number;
  level?: number;
}

interface LeaderboardUser {
  telegram_id: number;
  username: string;
  balance: number;
  slaves_count: number;
}

type Tab = 'profile' | 'slaves' | 'market' | 'games' | 'shop' | 'leaderboard';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [user, setUser] = useState<UserData | null>(null);
  const [slaves, setSlaves] = useState<MarketUser[]>([]);
  const [market, setMarket] = useState<MarketUser[]>([]);
  const [globals, setGlobals] = useState<{ jackpot_fund: number }>({ jackpot_fund: 10000 });
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [bet, setBet] = useState(100);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<{ type: string, win: number } | null>(null);

  const [selectedSlave, setSelectedSlave] = useState<MarketUser | null>(null);
  const [shopModal, setShopModal] = useState<{ type: 'stars' | 'coins', isOpen: boolean } | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setUser(data);
      }
    } catch (err) {
      console.error('Fetch user error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSlaves = useCallback(async () => {
    try {
      const response = await fetch('/api/slaves', {
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      const data = await response.json();
      if (response.ok) {
        setSlaves(data);
        // Update selected slave if it's open
        if (selectedSlave) {
          const updated = data.find((s: MarketUser) => s.telegram_id === selectedSlave.telegram_id);
          if (updated) setSelectedSlave(updated);
        }
      }
    } catch (err) {
      console.error('Fetch slaves error:', err);
    }
  }, [selectedSlave]);

  const fetchMarket = useCallback(async () => {
    try {
      const response = await fetch('/api/market', {
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      const data = await response.json();
      if (response.ok) setMarket(data);
    } catch (err) {
      console.error('Fetch market error:', err);
    }
  }, []);

  const fetchGlobals = useCallback(async () => {
    try {
      const response = await fetch('/api/globals');
      const data = await response.json();
      if (response.ok) setGlobals(data);
    } catch (err) {
      console.error('Fetch globals error:', err);
    }
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const response = await fetch('/api/leaderboard', {
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      const data = await response.json();
      if (response.ok) setLeaderboard(data);
    } catch (err) {
      console.error('Fetch leaderboard error:', err);
    }
  }, []);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    fetchUser();
    fetchGlobals();
  }, [fetchUser, fetchGlobals]);

  useEffect(() => {
    if (activeTab === 'slaves') fetchSlaves();
    if (activeTab === 'market') fetchMarket();
    if (activeTab === 'games') fetchGlobals();
    if (activeTab === 'leaderboard') fetchLeaderboard();
  }, [activeTab, fetchSlaves, fetchMarket, fetchGlobals, fetchLeaderboard]);

  const handleBuy = async (targetId: number) => {
    setActionLoading(targetId);
    try {
      const response = await fetch('/api/buy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({ targetId }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        WebApp.HapticFeedback.notificationOccurred('success');
        fetchUser();
      } else {
        WebApp.showAlert(data.message || 'Ошибка при покупке');
      }
    } catch (err) {
      WebApp.showAlert('Ошибка сети');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpgrade = async (targetId: number) => {
    setActionLoading(`upgrade-${targetId}`);
    try {
      const response = await fetch('/api/upgrade', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData 
        },
        body: JSON.stringify({ targetId }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        WebApp.HapticFeedback.notificationOccurred('success');
        fetchUser();
        fetchSlaves();
      } else {
        WebApp.showAlert(data.message || 'Ошибка улучшения');
      }
    } catch (err) {
      WebApp.showAlert('Ошибка сети');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSellSlave = async (slaveId: number) => {
    setActionLoading(`sell-${slaveId}`);
    try {
      const response = await fetch('/api/sell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({ slaveId }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        WebApp.HapticFeedback.notificationOccurred('success');
        fetchUser();
        fetchSlaves();
      } else {
        WebApp.showAlert(data.message || 'Ошибка продажи');
      }
    } catch (err) {
      WebApp.showAlert('Ошибка сети');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSpin = async (isFree: boolean) => {
    if (isSpinning) return;
    setIsSpinning(true);
    setSpinResult(null);
    try {
      const response = await fetch('/api/spin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({ bet, isFree }),
      });
      const data = await response.json();
      
      // Simulate wheel spin delay
      setTimeout(() => {
        setIsSpinning(false);
        if (response.ok && data.success) {
          setSpinResult(data);
          fetchUser();
          fetchGlobals();
          WebApp.HapticFeedback.notificationOccurred(data.win > 0 ? 'success' : 'error');
        } else {
          WebApp.showAlert(data.message || 'Ошибка спина');
        }
      }, 2000);

    } catch (err) {
      setIsSpinning(false);
      WebApp.showAlert('Ошибка сети');
    }
  };

  const handleBuyCoins = async (amount: number, stars: number) => {
    // In real app, use WebApp.openInvoice
    // For demo, we simulate success
    setActionLoading(`buy-${amount}`);
    try {
      const response = await fetch('/api/buy-coins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({ amount }),
      });
      if (response.ok) {
        WebApp.showAlert(`Успешно куплено ${amount.toLocaleString()} монет!`);
        fetchUser();
      }
    } catch (err) {
      WebApp.showAlert('Ошибка оплаты');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBuyGhost = async () => {
    setActionLoading('ghost');
    try {
      const response = await fetch('/api/buy-ghost', {
        method: 'POST',
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      if (response.ok) {
        WebApp.showAlert('Невидимка активирована на 24 часа!');
        fetchUser();
      }
    } catch (err) {
      WebApp.showAlert('Ошибка оплаты');
    } finally {
      setActionLoading(null);
      setShopModal(null);
    }
  };

  const handleBuyGhostShort = async () => {
    setActionLoading('ghost-short');
    try {
      const response = await fetch('/api/buy-ghost-short', {
        method: 'POST',
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      const data = await response.json();
      if (response.ok) {
        WebApp.showAlert('Невидимка на 60 минут активирована!');
        fetchUser();
      } else {
        WebApp.showAlert(data.message || 'Ошибка покупки');
      }
    } catch (err) {
      WebApp.showAlert('Ошибка сети');
    } finally {
      setActionLoading(null);
      setShopModal(null);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-crypto-gold animate-spin" />
      </div>
    );
  }

  const filteredMarket = market.filter(m => 
    m.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.telegram_id.toString().includes(searchQuery)
  );

  return (
    <div className="min-h-screen flex flex-col pb-32">
      {/* Header */}
      <header className="px-6 py-4 flex justify-between items-center sticky top-0 z-30 bg-[var(--crypto-header-bg)] backdrop-blur-xl">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-[0.2em]">ID: {user?.telegram_id}</span>
          <h1 className="text-lg font-extrabold tracking-tight">{user?.username}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-4 py-2 rounded-2xl">
            <div className="flex flex-col items-end">
              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase leading-none mb-1">Баланс</span>
              <span className="text-base font-black text-crypto-gold leading-none">{user?.balance.toLocaleString()}</span>
            </div>
            <Coins className="w-5 h-5 text-crypto-gold" />
          </div>
          <button 
            onClick={() => setActiveTab('shop')}
            className="w-10 h-10 rounded-xl bg-crypto-gold flex items-center justify-center text-black shadow-lg shadow-crypto-gold/20 active:scale-90 transition-transform"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 pt-2">
        <AnimatePresence mode="wait">
          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              {/* Status Card */}
              <div className="glass-card p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Crown className="w-24 h-24 text-crypto-gold" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-6">
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${user?.owner_id ? 'bg-red-500/20 text-red-400' : 'bg-crypto-emerald/20 text-crypto-emerald'}`}>
                      {user?.owner_id ? 'В рабстве' : 'Свободен'}
                    </div>
                    {user?.ghost_until && new Date(user.ghost_until) > new Date() && (
                      <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-400 flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        GHOST
                      </div>
                    )}
                    {user?.owner && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">Владелец: <span className="font-bold">{user.owner.username}</span></span>
                    )}
                  </div>

                  <div className="flex justify-between items-end mb-8">
                    <div className="space-y-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">Ваша стоимость</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black">{user?.current_price.toLocaleString()}</span>
                        <Coins className="w-5 h-5 text-crypto-gold" />
                      </div>
                    </div>
                  </div>

                  {user?.owner_id ? (
                    <button 
                      onClick={() => user && handleBuy(user.telegram_id)}
                      disabled={actionLoading === user?.telegram_id || (user?.balance || 0) < (user?.current_price || 0) * 1.25}
                      className="gold-button w-full flex flex-col items-center py-4 h-auto"
                    >
                      <Zap className="w-5 h-5 mb-1" />
                      <span className="text-xs">ВЫКУПИТЬ СЕБЯ</span>
                      <span className="text-[9px] opacity-70">{(user?.current_price ? Math.floor(user.current_price * 1.25) : 0).toLocaleString()}</span>
                    </button>
                  ) : (
                    <div className="p-4 rounded-xl bg-crypto-emerald/10 border border-crypto-emerald/20 text-center">
                      <p className="text-sm font-bold text-crypto-emerald">Вы свободны</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card p-5 flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
                    <Users className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase mb-1">Рабы</span>
                  <span className="text-2xl font-black">{slaves.length}</span>
                </div>
                <div className="glass-card p-5 flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-xl bg-crypto-emerald/10 flex items-center justify-center mb-3">
                    <TrendingUp className="w-5 h-5 text-crypto-emerald" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase mb-1">Доход/мин</span>
                  <span className="text-2xl font-black text-crypto-emerald">+{user?.base_income}</span>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'slaves' && (
            <motion.div
              key="slaves"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-end mb-2">
                <h2 className="text-xl font-black">Мои Рабы</h2>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">{slaves.length} всего</span>
              </div>
              
              {slaves.length === 0 ? (
                <div className="glass-card py-16 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                  <Lock className="w-12 h-12 mb-4 opacity-10" />
                  <p className="text-sm font-medium">У вас пока нет рабов</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {slaves.map(slave => (
                    <div 
                      key={slave.telegram_id} 
                      onClick={() => setSelectedSlave(slave)}
                      className="glass-card p-4 flex justify-between items-center group active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center border border-black/10 dark:border-white/10">
                          <User className="w-5 h-5 text-slate-400" />
                        </div>
                        <div>
                          <div className="font-bold">{slave.username}</div>
                          <div className="text-[10px] text-crypto-emerald font-bold">+{slave.base_income} / мин</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-black">{slave.current_price.toLocaleString()}</div>
                          <div className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase">Цена</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Slave Details Modal/Overlay */}
              <AnimatePresence>
                {selectedSlave && (
                  <motion.div 
                    initial={{ opacity: 0, y: 100 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 100 }}
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end"
                  >
                    <div className="w-full bg-[var(--crypto-bg)] rounded-t-[32px] p-8 space-y-6 border-t border-white/10">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-full bg-crypto-gold/10 flex items-center justify-center">
                            <User className="w-8 h-8 text-crypto-gold" />
                          </div>
                          <div>
                            <h3 className="text-2xl font-black">{selectedSlave.username}</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Уровень {selectedSlave.level} / 20</p>
                          </div>
                        </div>
                        <button onClick={() => setSelectedSlave(null)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center font-bold">✕</button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="glass-card p-4">
                          <span className="text-[10px] text-slate-500 font-bold uppercase">Доход</span>
                          <div className="text-xl font-black text-crypto-emerald">+{selectedSlave.base_income} / мин</div>
                        </div>
                        <div className="glass-card p-4">
                          <span className="text-[10px] text-slate-500 font-bold uppercase">Стоимость</span>
                          <div className="text-xl font-black">{selectedSlave.current_price.toLocaleString()}</div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <button 
                          onClick={() => handleUpgrade(selectedSlave.telegram_id)}
                          disabled={actionLoading === `upgrade-${selectedSlave.telegram_id}` || (selectedSlave.level || 0) >= 20 || (user?.balance || 0) < (selectedSlave.current_price * (selectedSlave.level || 1) * 1.5)}
                          className="gold-button w-full flex justify-between items-center px-6"
                        >
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5" />
                            <span>УЛУЧШИТЬ</span>
                          </div>
                          <span className="text-sm opacity-80">{(selectedSlave.current_price * (selectedSlave.level || 1) * 1.5).toLocaleString()}</span>
                        </button>

                        <button 
                          onClick={() => {
                            handleSellSlave(selectedSlave.telegram_id);
                            setSelectedSlave(null);
                          }}
                          disabled={actionLoading === `sell-${selectedSlave.telegram_id}`}
                          className="w-full py-4 rounded-xl border border-red-500/30 text-red-500 font-black text-sm hover:bg-red-500/5 transition-colors flex items-center justify-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          ПРОДАТЬ (80% стоимости: {(selectedSlave.current_price * 0.8).toLocaleString()} монет)
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'market' && (
            <motion.div
              key="market"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Поиск игроков..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-crypto-gold/50 transition-all"
                />
              </div>

              <div className="space-y-3">
                {filteredMarket.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 dark:text-slate-400 font-medium">Никого не найдено</div>
                ) : (
                  filteredMarket.map(m => (
                    <div key={m.telegram_id} className="glass-card p-4 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center border border-black/10 dark:border-white/10">
                          <User className="w-5 h-5 text-slate-400" />
                        </div>
                        <div>
                          <div className="font-bold">{m.username}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">Доход: +{m.base_income}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-black text-crypto-gold">{m.current_price.toLocaleString()}</div>
                          <div className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase leading-none">Цена</div>
                        </div>
                        <button 
                          onClick={() => handleBuy(m.telegram_id)}
                          disabled={actionLoading === m.telegram_id || (user?.balance || 0) < m.current_price}
                          className="emerald-button"
                        >
                          {actionLoading === m.telegram_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'КУПИТЬ'
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'games' && (
            <motion.div
              key="games"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 flex flex-col items-center"
            >
              <div className="w-full glass-card p-4 flex flex-col items-center justify-center bg-gradient-to-b from-crypto-gold/20 to-transparent border-crypto-gold/30 shadow-[0_0_30px_rgba(251,191,36,0.1)]">
                <span className="text-[10px] text-crypto-gold font-black uppercase tracking-[0.3em] mb-1">JACKPOT FUND</span>
                <div className="text-4xl font-black text-crypto-gold drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]">
                  {globals.jackpot_fund.toLocaleString()}
                </div>
              </div>

              <div className="relative py-12 flex flex-col items-center">
                {/* Indicator */}
                <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20">
                  <div className="w-6 h-8 bg-crypto-gold rounded-b-full shadow-lg flex items-center justify-center">
                    <div className="w-2 h-2 bg-black rounded-full" />
                  </div>
                </div>

                <motion.div 
                  animate={isSpinning ? { rotate: 3600 } : { rotate: 0 }}
                  transition={isSpinning ? { duration: 3, ease: [0.45, 0.05, 0.55, 0.95] } : { duration: 0 }}
                  className="w-72 h-72 rounded-full border-[16px] border-crypto-gold/30 relative flex items-center justify-center bg-black/20 shadow-[0_0_60px_rgba(251,191,36,0.15)] overflow-hidden"
                >
                  {/* Wheel Segments (Visual only) */}
                  <div className="absolute inset-0 opacity-20">
                    {[...Array(8)].map((_, i) => (
                      <div 
                        key={i} 
                        className="absolute top-0 left-1/2 w-1 h-full bg-crypto-gold origin-bottom"
                        style={{ transform: `translateX(-50%) rotate(${i * 45}deg)` }}
                      />
                    ))}
                  </div>
                  <Dices className={`w-24 h-24 text-crypto-gold ${isSpinning ? 'animate-pulse' : ''}`} />
                </motion.div>

                <motion.button 
                  onClick={() => handleSpin(false)}
                  disabled={isSpinning || (user?.balance || 0) < bet}
                  whileTap={{ scale: 0.9 }}
                  className={`mt-8 gold-button px-12 py-5 rounded-3xl text-xl font-black shadow-[0_10px_40px_rgba(251,191,36,0.3)] ${isSpinning ? 'opacity-50 cursor-not-allowed' : 'animate-pulse-slow'}`}
                >
                  SPIN
                </motion.button>
              </div>

              {spinResult && (
                <motion.div 
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`w-full p-4 rounded-2xl font-black text-center text-lg border ${spinResult.win > 0 ? 'bg-crypto-emerald/20 text-crypto-emerald border-crypto-emerald/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}
                >
                  {spinResult.type === 'jackpot' ? '🔥 JACKPOT!!! 🔥' : spinResult.win > 0 ? `ВЫИГРЫШ: +${spinResult.win}` : 'ПУСТО'}
                </motion.div>
              )}

              <div className="w-full space-y-4">
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => setBet(Math.max(10, bet - 100))} className="w-12 h-12 rounded-2xl bg-black/10 border border-white/10 flex items-center justify-center font-black text-xl">-</button>
                  <div className="glass-card px-8 py-3 font-black text-2xl w-40 text-center border-crypto-gold/30">{bet.toLocaleString()}</div>
                  <button onClick={() => setBet(Math.min(100000, bet + 100))} className="w-12 h-12 rounded-2xl bg-black/10 border border-white/10 flex items-center justify-center font-black text-xl">+</button>
                </div>

                <button 
                  onClick={() => handleSpin(true)}
                  disabled={isSpinning || (user?.last_free_spin && new Date(user.last_free_spin) > new Date(Date.now() - 24*60*60*1000))}
                  className="w-full glass-card py-4 border-crypto-emerald/30 text-crypto-emerald font-black tracking-widest active:scale-[0.98] transition-all disabled:opacity-30"
                >
                  FREE DAILY SPIN
                </button>
              </div>

              <div className="w-full glass-card p-4 space-y-3">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Таблица выплат</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-bold">
                  <div className="flex justify-between border-b border-white/5 pb-1"><span>ПУСТО</span><span className="text-slate-500">45%</span></div>
                  <div className="flex justify-between border-b border-white/5 pb-1"><span>x0.5</span><span className="text-slate-500">25%</span></div>
                  <div className="flex justify-between border-b border-white/5 pb-1"><span>x2</span><span className="text-crypto-gold">15%</span></div>
                  <div className="flex justify-between border-b border-white/5 pb-1"><span>БОНУС x2</span><span className="text-crypto-gold">9%</span></div>
                  <div className="flex justify-between border-b border-white/5 pb-1"><span>x10</span><span className="text-crypto-gold">5%</span></div>
                  <div className="flex justify-between border-b border-white/5 pb-1"><span>JACKPOT</span><span className="text-crypto-emerald">1%</span></div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'shop' && (
            <motion.div
              key="shop"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <h2 className="text-xl font-black">Магазин</h2>

              <div className="grid grid-cols-1 gap-4">
                <ShopItem 
                  title="500 МОНЕТ" 
                  price="25 Stars" 
                  icon={<Coins className="w-6 h-6 text-crypto-gold" />}
                  onClick={() => handleBuyCoins(500, 25)}
                  loading={actionLoading === 'buy-500'}
                />
                <ShopItem 
                  title="5,000 МОНЕТ" 
                  price="200 Stars" 
                  icon={<div className="flex -space-x-2"><Coins className="w-6 h-6 text-crypto-gold" /><Coins className="w-6 h-6 text-crypto-gold" /></div>}
                  onClick={() => handleBuyCoins(5000, 200)}
                  loading={actionLoading === 'buy-5000'}
                />
                <ShopItem 
                  title="50,000 МОНЕТ" 
                  price="1500 Stars" 
                  icon={<Zap className="w-8 h-8 text-crypto-gold" />}
                  onClick={() => handleBuyCoins(50000, 1500)}
                  loading={actionLoading === 'buy-50000'}
                />
                
                <div className="glass-card p-5 border-blue-500/30 bg-blue-500/5 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                      <Shield className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <div className="font-black uppercase tracking-tight">НЕВИДИМКА (24ч)</div>
                      <div className="text-[10px] text-slate-500 font-bold">Полная защита рабов</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShopModal({ type: 'stars', isOpen: true })}
                    className="bg-blue-500 text-white px-4 py-2 rounded-xl font-black text-xs shadow-lg shadow-blue-500/20"
                  >
                    50 Stars
                  </button>
                </div>

                <div className="glass-card p-5 border-indigo-500/30 bg-indigo-500/5 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                      <div className="font-black uppercase tracking-tight">НЕВИДИМКА (60 мин)</div>
                      <div className="text-[10px] text-slate-500 font-bold">Краткосрочная защита</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShopModal({ type: 'coins', isOpen: true })}
                    className="bg-indigo-500 text-white px-4 py-2 rounded-xl font-black text-xs shadow-lg shadow-indigo-500/20"
                  >
                    {((user?.base_income || 0) * 20).toLocaleString()} МОНЕТ
                  </button>
                </div>
              </div>

              {/* Shop Modals */}
              <AnimatePresence>
                {shopModal?.isOpen && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl flex items-center justify-center px-6"
                  >
                    <motion.div 
                      initial={{ scale: 0.9, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      className="w-full max-w-sm glass-card p-8 text-center space-y-6 border-white/10"
                    >
                      <div className="w-20 h-20 rounded-3xl bg-crypto-gold/10 flex items-center justify-center mx-auto">
                        {shopModal.type === 'stars' ? <Shield className="w-10 h-10 text-crypto-gold" /> : <Lock className="w-10 h-10 text-indigo-400" />}
                      </div>
                      
                      <div className="space-y-2">
                        <h3 className="text-2xl font-black">Спите спокойно!</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                          {shopModal.type === 'stars' 
                            ? "Эта функция даст вам невидимость на 24 часа, и никто не сможет купить ваших рабов."
                            : "Краткосрочная защита. Никто не сможет купить ваших рабов в течение часа."
                          }
                        </p>
                      </div>

                      <div className="space-y-3">
                        <button 
                          onClick={shopModal.type === 'stars' ? handleBuyGhost : handleBuyGhostShort}
                          disabled={actionLoading !== null}
                          className="gold-button w-full py-4 text-base"
                        >
                          {actionLoading !== null ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : (
                            shopModal.type === 'stars' ? "КУПИТЬ ЗА 50 ⭐" : `КУПИТЬ ЗА ${((user?.base_income || 0) * 20).toLocaleString()} МОНЕТ`
                          )}
                        </button>
                        <button 
                          onClick={() => setShopModal(null)}
                          className="w-full py-4 text-slate-500 font-bold text-sm"
                        >
                          ОТМЕНА
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black">Топ Игроков</h2>
                <div className="flex items-center gap-2 text-crypto-gold">
                  <Trophy className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">Global</span>
                </div>
              </div>

              <div className="space-y-3">
                {leaderboard.map((player, index) => (
                  <div 
                    key={player.telegram_id}
                    className={`glass-card p-4 flex items-center gap-4 border-white/5 ${player.telegram_id === user?.telegram_id ? 'border-crypto-gold/30 bg-crypto-gold/5' : ''}`}
                  >
                    <div className="w-8 flex justify-center">
                      {index === 0 ? <Crown className="w-6 h-6 text-crypto-gold" /> : 
                       index === 1 ? <div className="text-slate-300 font-black">2</div> :
                       index === 2 ? <div className="text-amber-600 font-black">3</div> :
                       <div className="text-slate-500 font-black">{index + 1}</div>}
                    </div>
                    
                    <div className="flex-1">
                      <div className="font-black flex items-center gap-2">
                        {player.username}
                        {player.telegram_id === user?.telegram_id && <span className="text-[8px] bg-crypto-gold text-black px-1 rounded">ВЫ</span>}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {player.slaves_count} рабов</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-black text-crypto-gold">{player.balance.toLocaleString()}</div>
                      <div className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Баланс</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation */}
      <div className="fixed bottom-8 left-0 right-0 px-6 z-40">
        <nav className="glass-nav max-w-md mx-auto flex justify-between items-center p-1">
          <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<User className="w-4 h-4" />} label="Профиль" />
          <NavButton active={activeTab === 'slaves'} onClick={() => setActiveTab('slaves')} icon={<Users className="w-4 h-4" />} label="Рабы" />
          <NavButton active={activeTab === 'market'} onClick={() => setActiveTab('market')} icon={<ShoppingBag className="w-4 h-4" />} label="Рынок" />
          <NavButton active={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')} icon={<Trophy className="w-4 h-4" />} label="Топ" />
          <NavButton active={activeTab === 'games'} onClick={() => setActiveTab('games')} icon={<Dices className="w-4 h-4" />} label="Игры" />
          <NavButton active={activeTab === 'shop'} onClick={() => setActiveTab('shop')} icon={<Store className="w-4 h-4" />} label="Магазин" />
        </nav>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`relative flex-1 flex flex-col items-center justify-center py-2 transition-all duration-300 ${active ? 'text-crypto-gold' : 'text-slate-500 dark:text-slate-400'}`}
    >
      {active && (
        <motion.div 
          layoutId="nav-active"
          className="absolute inset-0 bg-black/5 dark:bg-white/5 rounded-full -z-10"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        />
      )}
      <div className="mb-1">{icon}</div>
      <span className="text-[8px] font-black uppercase tracking-wider">{label}</span>
    </button>
  );
}

function ShopItem({ title, price, icon, onClick, loading }: { title: string, price: string, icon: ReactNode, onClick: () => void, loading: boolean }) {
  return (
    <div className="glass-card p-5 flex justify-between items-center">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-crypto-gold/10 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="font-black">{title}</div>
          <div className="text-[10px] text-slate-500 font-bold">Моментальное зачисление</div>
        </div>
      </div>
      <button 
        onClick={onClick}
        disabled={loading}
        className="gold-button py-2 px-4 text-xs h-auto"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : price}
      </button>
    </div>
  );
}

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
  telegram_id: string | number;
  username: string;
  balance: number;
  current_price: number;
  base_income: number;
  level: number;
  ghost_until: string | null;
  no_commission: boolean;
  on_market: boolean;
  market_price: number | null;
  market_slots_unlocked: number;
  owner_id: string | number | null;
  owner?: { username: string };
  last_collect_time: string;
  last_free_spin: string | null;
  slaves_count: number;
  total_income: number;
  photo_url: string | null;
}

interface MarketUser {
  telegram_id: string | number;
  username: string;
  current_price: number;
  base_income: number;
  level?: number;
  on_market?: boolean;
  photo_url?: string | null;
}

interface LeaderboardUser {
  telegram_id: string | number;
  username: string;
  balance: number;
  slaves_count: number;
}

type Tab = 'profile' | 'slaves' | 'market' | 'games' | 'shop' | 'leaderboard';

export default function App() {
  const API_URL = 'https://rab2026.onrender.com';
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [user, setUser] = useState<UserData | null>(null);
  const [displayBalance, setDisplayBalance] = useState(0);
  const [slaves, setSlaves] = useState<MarketUser[]>([]);
  const [market, setMarket] = useState<MarketUser[]>([]);
  const [globals, setGlobals] = useState<{ jackpot_fund: number }>({ jackpot_fund: 10000 });
  const [spinHistory, setSpinHistory] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [marketSort, setMarketSort] = useState<'new' | 'cheap' | 'expensive'>('new');
  const [bet, setBet] = useState(100);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<{ type: string, win: number } | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);

  const [selectedSlave, setSelectedSlave] = useState<MarketUser | null>(null);
  const [viewingProfile, setViewingProfile] = useState<(UserData & { slaves: MarketUser[] }) | null>(null);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [listingModal, setListingModal] = useState<{ isOpen: boolean, slotIndex: number } | null>(null);
  const [listingPrice, setListingPrice] = useState<string>('');
  const [listingSlaveId, setListingSlaveId] = useState<string | number | null>(null);
  const [shopModal, setShopModal] = useState<{ type: 'stars' | 'coins' | 'premium', isOpen: boolean } | null>(null);

  const botUsername = 'rabygame_bot'; // Обновлено на реальное имя бота

  // Real-time balance update
  useEffect(() => {
    if (!user) return;
    setDisplayBalance(user.balance);
  }, [user?.balance]);

  useEffect(() => {
    if (!user || !user.total_income || user.total_income <= 0) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      const lastCollect = new Date(user.last_collect_time).getTime();
      const elapsedMs = now - lastCollect;
      const elapsedMins = elapsedMs / 60000;
      const currentBalance = user.balance + (elapsedMins * user.total_income);
      setDisplayBalance(currentBalance);
    }, 100);

    return () => clearInterval(interval);
  }, [user?.balance, user?.total_income, user?.last_collect_time, user?.telegram_id]);

  const copyReferralLink = () => {
    const userId = user?.telegram_id || WebApp.initDataUnsafe.user?.id;
    if (!userId) {
      WebApp.showAlert('Ошибка: ID пользователя не найден. Попробуйте перезапустить бота.');
      return;
    }
    const link = `https://t.me/${botUsername}/app?startapp=${userId}`;
    navigator.clipboard.writeText(link);
    WebApp.showAlert('Ссылка скопирована!');
    WebApp.HapticFeedback.notificationOccurred('success');
  };

  const shareReferralLink = () => {
    const userId = user?.telegram_id || WebApp.initDataUnsafe.user?.id;
    if (!userId) {
      WebApp.showAlert('Ошибка: ID пользователя не найден. Попробуйте перезапустить бота.');
      return;
    }
    const link = `https://t.me/${botUsername}/app?startapp=${userId}`;
    const text = 'Стань моим рабом в Crypto Slaves и начни зарабатывать! ⛓️💰';
    WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  };

  const fetchUser = useCallback(async () => {
    try {
      const startParam = WebApp.initDataUnsafe.start_param;
      const response = await fetch(API_URL + '/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({ referrerId: startParam })
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
      const response = await fetch(API_URL + '/api/slaves', {
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
      const response = await fetch(`${API_URL}/api/market?sort=${marketSort}`, {
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      const data = await response.json();
      if (response.ok) setMarket(data);
    } catch (err) {
      console.error('Fetch market error:', err);
    }
  }, [marketSort]);

  const fetchProfile = async (id: string | number) => {
    try {
      const response = await fetch(`${API_URL}/api/profile/${id}`, {
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      const data = await response.json();
      if (response.ok) setViewingProfile(data);
    } catch (err) {
      WebApp.showAlert('Ошибка загрузки профиля');
    }
  };

  const fetchMyListings = useCallback(async () => {
    try {
      const response = await fetch(API_URL + '/api/market/my-listings', {
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      const data = await response.json();
      if (response.ok) setMyListings(data);
    } catch (err) {
      console.error('Fetch my listings error:', err);
    }
  }, []);

  const fetchGlobals = useCallback(async () => {
    try {
      const response = await fetch(API_URL + '/api/globals');
      const data = await response.json();
      if (response.ok) setGlobals(data);
    } catch (err) {
      console.error('Fetch globals error:', err);
    }
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const response = await fetch(API_URL + '/api/leaderboard', {
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      const data = await response.json();
      if (response.ok) setLeaderboard(data);
    } catch (err) {
      console.error('Fetch leaderboard error:', err);
    }
  }, []);

  const fetchSpinHistory = useCallback(async () => {
    try {
      const response = await fetch(API_URL + '/api/spin-history');
      const data = await response.json();
      if (response.ok) setSpinHistory(data);
    } catch (err) {
      console.error('Fetch spin history error:', err);
    }
  }, []);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    fetchUser();
    fetchGlobals();
    fetchLeaderboard();
  }, [fetchUser, fetchGlobals, fetchLeaderboard]);

  useEffect(() => {
    if (activeTab === 'slaves') {
      fetchSlaves();
      fetchMyListings();
    }
    if (activeTab === 'market') fetchMarket();
    if (activeTab === 'games') {
      fetchGlobals();
      fetchSpinHistory();
    }
    if (activeTab === 'leaderboard') fetchLeaderboard();
  }, [activeTab, fetchSlaves, fetchMyListings, fetchMarket, fetchGlobals, fetchLeaderboard, fetchSpinHistory]);

  const handleBuy = async (targetId: string | number) => {
    if (targetId.toString() === user?.telegram_id.toString()) {
      WebApp.showConfirm('Вы хотите выкупить сами себя?', (confirmed) => {
        if (confirmed) executeBuy(targetId);
      });
    } else {
      executeBuy(targetId);
    }
  };

  const executeBuy = async (targetId: string | number) => {
    setActionLoading(targetId);
    try {
      const response = await fetch(API_URL + '/api/buy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({ targetId }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        if (data.user) setUser(data.user);
        WebApp.HapticFeedback.notificationOccurred('success');
      } else {
        WebApp.showAlert(data.message || 'Ошибка при покупке');
      }
    } catch (err) {
      WebApp.showAlert('Ошибка сети');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBuyFromMarket = async (slaveId: string | number) => {
    if (slaveId.toString() === user?.telegram_id.toString()) {
      WebApp.showConfirm('Вы хотите выкупить сами себя?', (confirmed) => {
        if (confirmed) executeBuyFromMarket(slaveId);
      });
    } else {
      executeBuyFromMarket(slaveId);
    }
  };

  const executeBuyFromMarket = async (slaveId: string | number) => {
    setActionLoading(slaveId);
    try {
      const response = await fetch(API_URL + '/api/market/buy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({ slaveId }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        if (data.user) setUser(data.user);
        // Optimistically remove from market list
        setMarket(prev => prev.filter(m => m.slave.telegram_id.toString() !== slaveId.toString()));
        WebApp.HapticFeedback.notificationOccurred('success');
      } else {
        WebApp.showAlert(data.message || 'Ошибка при покупке');
      }
    } catch (err) {
      WebApp.showAlert('Ошибка сети');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpgrade = async (targetId: string | number) => {
    setActionLoading(`upgrade-${targetId}`);
    try {
      const response = await fetch(API_URL + '/api/upgrade', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData 
        },
        body: JSON.stringify({ targetId }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        if (data.user) setUser(data.user);
        WebApp.HapticFeedback.notificationOccurred('success');
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

  const handleSellSlave = async (slaveId: string | number) => {
    setActionLoading(`sell-${slaveId}`);
    try {
      const response = await fetch(API_URL + '/api/sell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({ slaveId }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        if (data.user) setUser(data.user);
        WebApp.HapticFeedback.notificationOccurred('success');
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
    
    // Start initial slow rotation
    const minFullTurns = 5;
    const baseRotation = wheelRotation + (minFullTurns * 360);
    
    try {
      const response = await fetch(API_URL + '/api/spin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData,
        },
        body: JSON.stringify({ bet, isFree }),
      });
      const data = await response.json();
      
      if (response.ok && data.success) {
        const segment = data.segment !== undefined ? data.segment : 1;
        
        // Calculate target rotation to land exactly on the segment
        const segmentOffset = (segment * 45) + 22.5;
        const targetRotation = baseRotation + (360 - (segmentOffset % 360));
        
        setWheelRotation(targetRotation);

        setTimeout(() => {
          setIsSpinning(false);
          setSpinResult(data);
          fetchUser();
          fetchGlobals();
          fetchSpinHistory();
          WebApp.HapticFeedback.notificationOccurred(data.win > 0 ? 'success' : 'error');
        }, 3000);
      } else {
        setIsSpinning(false);
        WebApp.showAlert(data.message || 'Ошибка спина');
      }
    } catch (err) {
      setIsSpinning(false);
      WebApp.showAlert('Ошибка сети при спине');
    }
  };

  const handleBuyCoins = async (amount: number, stars: number) => {
    // In real app, use WebApp.openInvoice
    // For demo, we simulate success
    setActionLoading(`buy-${amount}`);
    try {
      const response = await fetch(API_URL + '/api/buy-coins', {
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
      const response = await fetch(API_URL + '/api/buy-ghost', {
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

  const handleBuyPremium = async () => {
    setActionLoading('premium');
    try {
      const response = await fetch(API_URL + '/api/buy-premium', {
        method: 'POST',
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      if (response.ok) {
        WebApp.showAlert('Статус Premium активирован! Теперь комиссия 0%');
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
      const response = await fetch(API_URL + '/api/buy-ghost-short', {
        method: 'POST',
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      const data = await response.json();
      if (response.ok && data.success) {
        WebApp.showAlert('Невидимка активирована на 1 час!');
        fetchUser();
      } else {
        WebApp.showAlert(data.message || 'Ошибка оплаты');
      }
    } catch (err) {
      WebApp.showAlert('Ошибка оплаты');
    } finally {
      setActionLoading(null);
      setShopModal(null);
    }
  };

  const handleListSlave = async () => {
    if (!listingSlaveId || !listingPrice) return;
    setActionLoading('listing');
    try {
      const response = await fetch(API_URL + '/api/market/list', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData 
        },
        body: JSON.stringify({ 
          slaveId: String(listingSlaveId), // Передаем как строку для безопасности BigInt
          price: Number(listingPrice) 
        }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        WebApp.showAlert('Раб выставлен на рынок!');
        setListingModal(null);
        setListingPrice('');
        setListingSlaveId(null);
        fetchSlaves();
        fetchMyListings();
      } else {
        // Выводим ошибку от сервера в алерт для теста
        WebApp.showAlert(`Сервер: ${data.message || data.error || 'Ошибка'}`);
        console.error("Детали ошибки:", data);
      }
    } catch (err) {
      console.error('Ошибка сети:', err);
      WebApp.showAlert('Ошибка сети: сервер недоступен');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnlist = async (slaveId: string | number) => {
    setActionLoading(`unlist-${slaveId}`);
    try {
      const response = await fetch(API_URL + '/api/market/unlist', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp.initData 
        },
        body: JSON.stringify({ slaveId }),
      });
      if (response.ok) {
        WebApp.showAlert('Раб снят с продажи');
        fetchSlaves();
        fetchMyListings();
      }
    } catch (err) {
      WebApp.showAlert('Ошибка снятия');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBuySlot = async () => {
    setActionLoading('buy-slot');
    try {
      const response = await fetch(API_URL + '/api/buy-slot', {
        method: 'POST',
        headers: { 'x-telegram-init-data': WebApp.initData },
      });
      const data = await response.json();
      if (response.ok && data.success) {
        if (data.user) setUser(data.user);
        WebApp.showAlert('Слот успешно разблокирован!');
      } else {
        WebApp.showAlert(data.message || 'Ошибка покупки слота');
      }
    } catch (err) {
      WebApp.showAlert('Ошибка покупки слота');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-crypto-gold animate-spin" />
      </div>
    );
  }

  const filteredMarket = market.filter(m => {
    if (!m.slave) return false;
    return (m.slave.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (m.slave.telegram_id || '').toString().includes(searchQuery);
  });

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
              <span className="text-base font-black text-crypto-gold leading-none">{Math.floor(displayBalance).toLocaleString()}</span>
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
                <div className="glass-card p-5 flex flex-col items-center text-center relative group">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
                    <Users className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase mb-1">Рабы</span>
                  <span className="text-2xl font-black mb-2">{user?.slaves_count || 0}</span>
                  
                  <button 
                    onClick={shareReferralLink}
                    className="w-full py-2 rounded-lg bg-crypto-gold text-black text-[9px] font-black uppercase tracking-wider active:scale-95 transition-transform"
                  >
                    Добавить раба
                  </button>
                </div>
                <div className="glass-card p-5 flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-xl bg-crypto-emerald/10 flex items-center justify-center mb-3">
                    <TrendingUp className="w-5 h-5 text-crypto-emerald" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase mb-1">Доход/мин</span>
                  <span className="text-2xl font-black text-crypto-emerald">+{user?.total_income || 0}</span>
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
                <div className="flex items-center gap-3">
                  <button 
                    onClick={copyReferralLink}
                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-crypto-gold transition-colors"
                    title="Копировать ссылку"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={shareReferralLink}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-crypto-gold text-black text-[10px] font-black uppercase tracking-wider"
                  >
                    <Plus className="w-3 h-3" />
                    Добавить раба
                  </button>
                </div>
              </div>
              
              <div className="glass-card p-4 mb-4 bg-crypto-gold/5 border-crypto-gold/20">
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Ваша реферальная ссылка</p>
                <div className="flex items-center gap-2 bg-black/20 p-2 rounded-lg border border-white/5">
                  <code className="text-[10px] flex-1 truncate opacity-70">t.me/{botUsername}/app?startapp={user?.telegram_id || WebApp.initDataUnsafe.user?.id || '...'}</code>
                  <button 
                    onClick={copyReferralLink} 
                    className="bg-crypto-gold/10 text-crypto-gold px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider hover:bg-crypto-gold/20 transition-colors"
                  >
                    Копировать
                  </button>
                </div>
                <p className="text-[9px] text-slate-500 mt-2 italic">* Каждый новый раб приносит +1 монету в минуту!</p>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Мои Рабы</h3>
                  {slaves.length === 0 ? (
                    <div className="glass-card py-16 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                      <Lock className="w-12 h-12 mb-4 opacity-10" />
                      <p className="text-sm font-medium">У вас пока нет рабов</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Slaves List Header */}
                      <div className="px-4 flex text-[10px] font-black uppercase text-slate-500 tracking-widest">
                        <div className="flex-1">Игрок</div>
                        <div className="w-24 text-center">Доход</div>
                        <div className="w-24 text-right">Выкуп</div>
                      </div>

                      {slaves.map(slave => (
                        <div 
                          key={slave.telegram_id} 
                          onClick={() => setSelectedSlave(slave)}
                          className="glass-card p-4 flex justify-between items-center group active:scale-[0.98] transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center border border-black/10 dark:border-white/10 shrink-0 overflow-hidden">
                              {slave.photo_url ? (
                                <img src={slave.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <User className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold flex items-center gap-2 truncate">
                                {slave.username}
                                {slave.on_market && (
                                  <span className="text-[8px] bg-crypto-gold/20 text-crypto-gold px-1.5 py-0.5 rounded font-black uppercase shrink-0">На рынке</span>
                                )}
                              </div>
                              <div className="text-[9px] text-slate-500 truncate">ID: {slave.telegram_id}</div>
                            </div>
                          </div>

                          <div className="w-24 text-center">
                            <div className="text-xs font-black text-crypto-emerald">+{slave.base_income}</div>
                            <div className="text-[8px] text-slate-500 font-bold uppercase leading-none">/ мин</div>
                          </div>

                          <div className="w-24 text-right">
                            <div className="text-sm font-black text-slate-900 dark:text-white">{slave.current_price.toLocaleString()}</div>
                            <div className="text-[8px] text-slate-500 font-bold uppercase leading-none">Монет</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Мои объявления</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[...Array(20)].map((_, i) => {
                      const listing = myListings[i];
                      const isUnlocked = i < (user?.market_slots_unlocked || 1);
                      const slotPrice = i === 1 ? (isUnlocked ? 'Разблокировано' : '1000 монет') : i > 1 ? (isUnlocked ? 'Разблокировано' : `${25 + (i-2)*25} Stars`) : 'Бесплатно';
                      
                      return (
                        <div 
                          key={i}
                          onClick={() => {
                            if (listing) return;
                            if (isUnlocked) {
                              setListingModal({ isOpen: true, slotIndex: i });
                            } else if (i === 1) {
                              // Prompt to unlock 2nd slot
                              WebApp.showConfirm(
                                `Разблокировать 2-й слот за 1,000 монет?`,
                                (confirmed) => {
                                  if (confirmed) {
                                    handleBuySlot();
                                  }
                                }
                              );
                            } else {
                              WebApp.showAlert(`Этот слот заблокирован. Разблокируйте его в магазине за Stars!`);
                            }
                          }}
                          className={`glass-card p-4 h-32 flex flex-col items-center justify-center border-dashed border-2 transition-all ${listing ? 'border-crypto-gold/30 bg-crypto-gold/5' : !isUnlocked ? 'border-black/5 dark:border-white/5 opacity-50' : 'border-black/5 dark:border-white/5 hover:border-crypto-gold/40 cursor-pointer'}`}
                        >
                          {listing ? (
                            <div className="w-full h-full flex flex-col items-center justify-center text-center">
                              <User className="w-6 h-6 text-crypto-gold mb-2" />
                              <div className="text-[10px] font-bold truncate w-full text-slate-900 dark:text-white">{listing.slave.username}</div>
                              <div className="text-xs font-black text-amber-600 dark:text-crypto-gold">{listing.price.toLocaleString()}</div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleUnlist(listing.slave_id); }}
                                className="mt-2 text-[8px] font-black uppercase text-red-500 hover:text-red-400"
                              >
                                Снять
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center text-center">
                              {!isUnlocked ? <Lock className="w-5 h-5 mb-1 text-slate-600" /> : <Plus className="w-5 h-5 mb-1 text-crypto-gold" />}
                              <span className="text-[8px] font-black uppercase tracking-widest mb-1">{!isUnlocked ? 'Заблокировано' : 'Выставить'}</span>
                              <span className="text-[7px] font-bold text-slate-500 uppercase">{slotPrice}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Listing Modal */}
              <AnimatePresence>
                {listingModal?.isOpen && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl flex items-center justify-center px-6"
                  >
                    <motion.div 
                      initial={{ scale: 0.9, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      className="w-full max-w-sm glass-card p-8 space-y-6 border-white/10"
                    >
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black">Выставить на рынок</h3>
                        <button 
                          onClick={() => setListingModal(null)}
                          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold"
                        >
                          ✕
                        </button>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Выберите раба</label>
                          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 no-scrollbar">
                            {slaves.filter(s => !s.on_market).map(slave => (
                              <button
                                key={slave.telegram_id}
                                onClick={() => setListingSlaveId(slave.telegram_id)}
                                className={`p-3 rounded-xl border text-left transition-all ${listingSlaveId === slave.telegram_id ? 'bg-crypto-gold text-black border-crypto-gold' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-slate-900 dark:text-white'}`}
                              >
                                <div className="font-bold text-sm">{slave.username}</div>
                                <div className="text-[9px] opacity-70">Стоимость: {slave.current_price.toLocaleString()}</div>
                              </button>
                            ))}
                            {slaves.filter(s => !s.on_market).length === 0 && (
                              <div className="text-center py-4 text-slate-500 text-xs">Нет доступных рабов для продажи</div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Цена продажи</label>
                          <input 
                            type="number" 
                            placeholder="Введите цену..."
                            value={listingPrice}
                            onChange={(e) => setListingPrice(e.target.value)}
                            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl py-3 px-4 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-crypto-gold/50"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <button 
                          onClick={handleListSlave}
                          disabled={!listingSlaveId || !listingPrice || actionLoading !== null}
                          className="gold-button w-full py-4 text-sm"
                        >
                          {actionLoading === 'listing' ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ВЫСТАВИТЬ"}
                        </button>
                        <button 
                          onClick={() => setListingModal(null)}
                          className="w-full py-2 text-slate-500 font-bold text-xs"
                        >
                          ОТМЕНА
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Slave Details Modal/Overlay */}
              <AnimatePresence>
                {selectedSlave && (
                  <motion.div 
                    key="slave-details"
                    initial={{ opacity: 0, y: 100 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 100 }}
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end"
                  >
                    <div className="w-full bg-white dark:bg-[#1a1d23] rounded-t-[32px] p-8 space-y-6 border-t border-black/10 dark:border-white/10">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-full bg-crypto-gold/10 flex items-center justify-center">
                            <User className="w-8 h-8 text-crypto-gold" />
                          </div>
                          <div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white">{selectedSlave.username}</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Уровень {selectedSlave.level} / 20</p>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSlave(null);
                          }} 
                          className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center font-bold text-slate-900 dark:text-white z-[60] active:scale-90 transition-transform"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="glass-card p-4">
                          <span className="text-[10px] text-slate-500 font-bold uppercase">Доход</span>
                          <div className="text-xl font-black text-crypto-emerald">+{selectedSlave.base_income} / мин</div>
                        </div>
                        <div className="glass-card p-4">
                          <span className="text-[10px] text-slate-500 font-bold uppercase">Стоимость</span>
                          <div className="text-xl font-black text-slate-900 dark:text-white">{selectedSlave.current_price.toLocaleString()}</div>
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
              <div className="flex flex-col gap-4">
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
                
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  <SortTab active={marketSort === 'new'} onClick={() => setMarketSort('new')} label="Новые" />
                  <SortTab active={marketSort === 'cheap'} onClick={() => setMarketSort('cheap')} label="Дешевые" />
                  <SortTab active={marketSort === 'expensive'} onClick={() => setMarketSort('expensive')} label="Дорогие" />
                </div>
              </div>

               <div className="space-y-3">
                {filteredMarket.map((listing: any) => (
                  <div key={listing.id} className="glass-card p-4 flex justify-between items-center gap-4">
                    <div className="flex items-center gap-4 min-w-0 flex-1" onClick={() => fetchProfile(listing.slave.telegram_id)}>
                      <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex-shrink-0 flex items-center justify-center border border-black/10 dark:border-white/10">
                        <User className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold truncate text-sm">{listing.slave.username}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">Уровень {listing.slave.level}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="flex flex-col items-end justify-center">
                        <div className="flex items-center gap-1">
                          <span className="text-base font-black text-amber-600 dark:text-crypto-gold">{listing.price.toLocaleString()}</span>
                          <Coins className="w-3 h-3 text-crypto-gold" />
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tighter">Цена</span>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBuyFromMarket(listing.slave.telegram_id);
                        }}
                        disabled={actionLoading === listing.slave.telegram_id || (user?.balance || 0) < listing.price}
                        className="emerald-button min-w-[80px] py-2.5 text-xs font-black"
                      >
                        КУПИТЬ
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Profile View Modal */}
              <AnimatePresence>
                {viewingProfile && (
                  <motion.div 
                    initial={{ opacity: 0, y: 100 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 100 }}
                    className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-2xl flex items-end"
                  >
                    <div className="w-full bg-[var(--crypto-bg)] rounded-t-[32px] p-8 space-y-6 border-t border-white/10 max-h-[90vh] overflow-y-auto">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-full bg-crypto-gold/10 flex items-center justify-center">
                            <User className="w-8 h-8 text-crypto-gold" />
                          </div>
                          <div>
                            <h3 className="text-2xl font-black">{viewingProfile.username}</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Уровень {viewingProfile.level}</p>
                          </div>
                        </div>
                        <button onClick={() => setViewingProfile(null)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center font-bold">✕</button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="glass-card p-4">
                          <span className="text-[10px] text-slate-500 font-bold uppercase">Баланс</span>
                          <div className="text-xl font-black text-crypto-gold">{viewingProfile.balance.toLocaleString()}</div>
                        </div>
                        <div className="glass-card p-4">
                          <span className="text-[10px] text-slate-500 font-bold uppercase">Доход</span>
                          <div className="text-xl font-black text-crypto-emerald">+{viewingProfile.base_income} / мин</div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">Рабы игрока ({viewingProfile.slaves.length})</h4>
                        <div className="space-y-3">
                          {viewingProfile.slaves.map(slave => (
                            <div key={slave.telegram_id} className="glass-card p-4 flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <User className="w-4 h-4 text-slate-500" />
                                <span className="font-bold">{slave.username}</span>
                              </div>
                              <button 
                                onClick={() => handleBuy(slave.telegram_id)}
                                className="emerald-button text-[10px] py-2 px-4"
                              >
                                КУПИТЬ ({(slave.current_price * 2).toLocaleString()})
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button 
                        onClick={() => handleBuy(viewingProfile.telegram_id)}
                        disabled={viewingProfile.ghost_until && new Date(viewingProfile.ghost_until) > new Date()}
                        className="gold-button w-full py-4 flex flex-col h-auto"
                      >
                        <span className="text-xs">КУПИТЬ ИГРОКА</span>
                        <span className="text-sm opacity-80">{viewingProfile.current_price.toLocaleString()} МОНЕТ</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'games' && (
            <motion.div
              key="games"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 flex flex-col items-center pb-24"
            >
              <div className="w-full glass-card p-4 flex flex-col items-center justify-center bg-gradient-to-b from-crypto-gold/20 to-transparent border-crypto-gold/30 shadow-[0_0_30px_rgba(251,191,36,0.1)]">
                <span className="text-[10px] text-crypto-gold font-black uppercase tracking-[0.3em] mb-1">JACKPOT FUND</span>
                <div className="text-4xl font-black text-crypto-gold drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]">
                  {globals.jackpot_fund.toLocaleString()}
                </div>
              </div>

              {/* Live Feed */}
              <div className="w-full glass-card p-3 bg-black/20 border-white/5 overflow-hidden">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live Feed</span>
                </div>
                <div className="space-y-1 h-20 overflow-y-auto custom-scrollbar">
                  {spinHistory.length > 0 ? spinHistory.map((h, i) => (
                    <div key={i} className="text-[10px] flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                      <span className="text-slate-400 font-bold truncate max-w-[100px]">{h.username}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Ставка: {h.bet}</span>
                        <span className={h.win > 0 ? 'text-crypto-emerald font-black' : 'text-red-400'}>
                          {h.type === 'jackpot' ? 'JACKPOT!' : h.win > 0 ? `+${h.win}` : 'Loss'}
                        </span>
                      </div>
                    </div>
                  )) : (
                    <div className="text-[10px] text-slate-600 text-center py-4 italic">Ожидание ставок...</div>
                  )}
                </div>
              </div>

              <div className="relative py-8 flex flex-col items-center">
                {/* Indicator */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
                  <div className="w-6 h-8 bg-white rounded-b-full shadow-lg flex items-center justify-center border-2 border-crypto-gold">
                    <div className="w-1.5 h-1.5 bg-black rounded-full" />
                  </div>
                </div>

                <div className="relative w-80 h-80">
                  <motion.div 
                    animate={{ rotate: wheelRotation }}
                    transition={{ duration: 3, ease: [0.15, 0, 0.15, 1] }}
                    className="w-full h-full rounded-full border-[10px] border-white/10 relative overflow-hidden shadow-[0_0_60px_rgba(251,191,36,0.2)]"
                  >
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      {/* 8 segments of 45 degrees */}
                      {[
                        { color: '#FFD700', label: 'JACKPOT' }, // 0
                        { color: '#475569', label: 'EMPTY' },   // 1
                        { color: '#3B82F6', label: 'x0.5' },    // 2
                        { color: '#10B981', label: 'x2' },      // 3
                        { color: '#475569', label: 'EMPTY' },   // 4
                        { color: '#F59E0B', label: 'x10' },     // 5
                        { color: '#10B981', label: 'x2' },      // 6
                        { color: '#475569', label: 'EMPTY' },   // 7
                      ].map((seg, i) => {
                        const startAngle = i * 45;
                        const endAngle = (i + 1) * 45;
                        const x1 = 50 + 50 * Math.cos((startAngle * Math.PI) / 180);
                        const y1 = 50 + 50 * Math.sin((startAngle * Math.PI) / 180);
                        const x2 = 50 + 50 * Math.cos((endAngle * Math.PI) / 180);
                        const y2 = 50 + 50 * Math.sin((endAngle * Math.PI) / 180);
                        
                        return (
                          <g key={i}>
                            <path 
                              d={`M 50 50 L ${x1} ${y1} A 50 50 0 0 1 ${x2} ${y2} Z`} 
                              fill={seg.color}
                              className="stroke-black/20 stroke-1"
                            />
                            <text 
                              x="75" y="50" 
                              transform={`rotate(${startAngle + 22.5}, 50, 50)`}
                              fill="white" 
                              fontSize="4" 
                              fontWeight="900" 
                              textAnchor="middle"
                              className="select-none"
                            >
                              {seg.label}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md border-2 border-white/20 flex items-center justify-center shadow-inner">
                        <Dices className={`w-7 h-7 text-white ${isSpinning ? 'animate-bounce' : ''}`} />
                      </div>
                    </div>
                  </motion.div>
                </div>

                <motion.button 
                  onClick={() => handleSpin(false)}
                  disabled={isSpinning || (user?.balance || 0) < bet}
                  whileTap={{ scale: 0.95 }}
                  className={`mt-8 gold-button px-12 py-4 rounded-2xl text-lg font-black shadow-[0_15px_30px_rgba(251,191,36,0.3)] ${isSpinning ? 'opacity-50 grayscale' : 'animate-pulse-slow'}`}
                >
                  {isSpinning ? 'УДАЧИ...' : 'ИГРАТЬ'}
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
                  <div className="flex justify-between border-b border-white/5 pb-1"><span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#475569]" /> ПУСТО</span><span className="text-slate-500">45%</span></div>
                  <div className="flex justify-between border-b border-white/5 pb-1"><span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#3B82F6]" /> x0.5</span><span className="text-slate-500">25%</span></div>
                  <div className="flex justify-between border-b border-white/5 pb-1"><span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#10B981]" /> x2 (x2)</span><span className="text-crypto-gold">24%</span></div>
                  <div className="flex justify-between border-b border-white/5 pb-1"><span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#F59E0B]" /> x10</span><span className="text-crypto-gold">5%</span></div>
                  <div className="flex justify-between border-b border-white/5 pb-1"><span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#FFD700]" /> JACKPOT</span><span className="text-crypto-emerald">1%</span></div>
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
                  title="PREMIUM СТАТУС" 
                  price="50 Stars" 
                  icon={<Crown className="w-6 h-6 text-crypto-gold" />}
                  onClick={() => setShopModal({ type: 'premium', isOpen: true })}
                  loading={actionLoading === 'premium'}
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
                          onClick={shopModal.type === 'stars' ? handleBuyGhost : shopModal.type === 'premium' ? handleBuyPremium : handleBuyGhostShort}
                          disabled={actionLoading !== null}
                          className="gold-button w-full py-4 text-base"
                        >
                          {actionLoading !== null ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : (
                            shopModal.type === 'stars' ? "КУПИТЬ ЗА 50 ⭐" : shopModal.type === 'premium' ? "КУПИТЬ ЗА 50 ⭐" : `КУПИТЬ ЗА ${((user?.base_income || 0) * 20).toLocaleString()} МОНЕТ`
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
                      <div className="font-black text-crypto-gold">{Math.floor(player.balance).toLocaleString()}</div>
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

function SortTab({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${active ? 'bg-crypto-gold text-black' : 'bg-white/5 text-slate-500 border border-white/5'}`}
    >
      {label}
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

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { TrendingUp, Flame, MessageSquare, Heart, PenLine, Zap } from "lucide-react";

interface UserStats {
  userId: string;
  level: number;
  xp: number;
  totalConfessions: number;
  totalComments: number;
  totalLikesReceived: number;
  totalLikesGiven: number;
  streakDays: number;
  lastActiveAt: string;
}

export function LevelDisplay() {
  const { isSignedIn, getToken } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setLoading(true);
      setReloadKey((key) => key + 1);
    };
    window.addEventListener("gamification:updated", refresh);
    return () => window.removeEventListener("gamification:updated", refresh);
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchStats = async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/gamification/stats", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error(`Stats request failed (${res.status})`);
        const data = await res.json();
        if (!cancelled) {
          setStats(data);
          setError(false);
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken, reloadKey]);

  const xpInCurrentLevel = stats ? stats.xp % 100 : 0;
  const xpProgress = xpInCurrentLevel;

  if (!isSignedIn) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 text-center border border-slate-200 dark:border-slate-700 shadow-sm">
        <TrendingUp className="mx-auto text-slate-400 dark:text-slate-500 mb-3" size={40} />
        <p className="text-slate-600 dark:text-slate-400 font-medium">Sign in to track your progress</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 text-center border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mx-auto mb-4"></div>
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 text-center border border-slate-200 dark:border-slate-700 shadow-sm">
        <TrendingUp className="mx-auto text-slate-400 dark:text-slate-500 mb-3" size={40} />
        <p className="text-slate-600 dark:text-slate-400 font-medium">
          {error ? "Progress could not be loaded." : "No stats available."}
        </p>
        {error && (
          <button
            className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
            onClick={() => {
              setLoading(true);
              setReloadKey((key) => key + 1);
            }}
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950/30 dark:via-purple-950/30 dark:to-pink-950/30 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-800/50 shadow-lg shadow-indigo-500/10 dark:shadow-none">
      {/* Header with Level Badge */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Zap className="text-white" size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Your Progress</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Keep growing!</p>
          </div>
        </div>
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg shadow-indigo-500/30">
          Level {stats.level}
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium">
          <span className="flex items-center gap-1">
            <Zap className="text-indigo-500" size={14} />
            XP Progress
          </span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{xpInCurrentLevel} / 100 XP</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-3 rounded-full transition-all duration-700 ease-out shadow-lg shadow-indigo-500/30"
            style={{ width: `${Math.max(0, Math.min(xpProgress, 100))}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 text-center border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
            <PenLine className="text-blue-600 dark:text-blue-400" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {stats.totalConfessions}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Confessions</div>
        </div>

        <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 text-center border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
            <MessageSquare className="text-green-600 dark:text-green-400" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {stats.totalComments}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Comments</div>
        </div>

        <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 text-center border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Heart className="text-red-600 dark:text-red-400" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {stats.totalLikesReceived}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Likes Received</div>
        </div>

        <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 text-center border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Flame className="text-orange-600 dark:text-orange-400" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {stats.streakDays}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Day Streak</div>
        </div>
      </div>

      {/* Streak Info */}
      {stats.streakDays > 0 && (
        <div className="mt-4 bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 border border-orange-200 dark:border-orange-800/50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/30">
            <Flame className="text-white" size={20} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-800 dark:text-slate-100">
              {stats.streakDays} Day Streak! 🔥
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Keep coming back to maintain your streak
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

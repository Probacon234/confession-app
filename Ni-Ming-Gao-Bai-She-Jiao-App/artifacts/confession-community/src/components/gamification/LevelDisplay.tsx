import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { TrendingUp, Flame, MessageSquare, Heart, PenLine } from "lucide-react";

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
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <TrendingUp className="mx-auto text-gray-400 mb-2" size={32} />
        <p className="text-gray-600">Sign in to track your progress</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        Loading stats...
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <TrendingUp className="mx-auto text-gray-400 mb-2" size={32} />
        <p className="text-gray-600">
          {error ? "Progress could not be loaded." : "No stats available."}
        </p>
        {error && (
          <button
            className="mt-2 text-sm text-blue-600 underline"
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
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800 text-lg">Your Progress</h3>
        <div className="bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
          Level {stats.level}
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>XP Progress</span>
          <span>{xpInCurrentLevel} / 100 XP</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(xpProgress, 100))}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
          <PenLine className="mx-auto text-blue-500 mb-1" size={20} />
          <div className="text-2xl font-bold text-gray-800">
            {stats.totalConfessions}
          </div>
          <div className="text-xs text-gray-600">Confessions</div>
        </div>

        <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
          <MessageSquare className="mx-auto text-green-500 mb-1" size={20} />
          <div className="text-2xl font-bold text-gray-800">
            {stats.totalComments}
          </div>
          <div className="text-xs text-gray-600">Comments</div>
        </div>

        <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
          <Heart className="mx-auto text-red-500 mb-1" size={20} />
          <div className="text-2xl font-bold text-gray-800">
            {stats.totalLikesReceived}
          </div>
          <div className="text-xs text-gray-600">Likes Received</div>
        </div>

        <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
          <Flame className="mx-auto text-orange-500 mb-1" size={20} />
          <div className="text-2xl font-bold text-gray-800">
            {stats.streakDays}
          </div>
          <div className="text-xs text-gray-600">Day Streak</div>
        </div>
      </div>

      {/* Streak Info */}
      {stats.streakDays > 0 && (
        <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-3">
          <Flame className="text-orange-500" size={24} />
          <div>
            <div className="font-semibold text-gray-800">
              {stats.streakDays} Day Streak!
            </div>
            <div className="text-xs text-gray-600">
              Keep coming back to maintain your streak
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

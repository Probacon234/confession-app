import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { Award, Lock, Trophy, Star } from "lucide-react";

interface Badge {
  id: number;
  name: string;
  description: string;
  icon: string;
  requirementType: string;
  requirementValue: number;
  earned: boolean;
  earnedAt?: string;
}

export function BadgesDisplay() {
  const { isSignedIn, getToken } = useAuth();
  const [badges, setBadges] = useState<Badge[]>([]);
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
    const fetchBadges = async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/gamification/badges/all", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error(`Badges request failed (${res.status})`);
        const data = await res.json();
        if (!cancelled) {
          setBadges(data);
          setError(false);
        }
      } catch (error) {
        console.error("Failed to fetch badges:", error);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchBadges();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken, reloadKey]);

  if (!isSignedIn) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 text-center border border-slate-200 dark:border-slate-700 shadow-sm">
        <Award className="mx-auto text-slate-400 dark:text-slate-500 mb-3" size={40} />
        <p className="text-slate-600 dark:text-slate-400 font-medium">Sign in to track your badges</p>
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

  if (error) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 text-center border border-slate-200 dark:border-slate-700 shadow-sm">
        <p className="text-slate-600 dark:text-slate-400 font-medium">Badges could not be loaded.</p>
        <button
          className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
          onClick={() => {
            setLoading(true);
            setReloadKey((key) => key + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  const earnedBadges = badges.filter((b) => b.earned);
  const unearnedBadges = badges.filter((b) => !b.earned);

  return (
    <div className="space-y-6">
      {/* Earned Badges Section */}
      {earnedBadges.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-950/30 dark:via-yellow-950/30 dark:to-orange-950/30 rounded-2xl p-6 border border-amber-200 dark:border-amber-800/50 shadow-lg shadow-amber-500/10 dark:shadow-none">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg mb-4 flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Trophy className="text-white" size={18} />
            </div>
            Earned Badges
            <span className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-2.5 py-1 rounded-full text-xs font-bold">
              {earnedBadges.length}
            </span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {earnedBadges.map((badge) => (
              <div
                key={badge.id}
                className="bg-white dark:bg-slate-800/50 rounded-xl p-4 text-center border border-amber-200 dark:border-amber-800/50 shadow-sm hover:shadow-md transition-all hover:scale-105 cursor-default group"
              >
                <div className="text-4xl mb-3 relative inline-block">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                  <span className="relative">{badge.icon}</span>
                </div>
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1">
                  {badge.name}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                  {badge.description}
                </p>
                {badge.earnedAt && (
                  <div className="flex items-center justify-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    <Star size={10} className="fill-current" />
                    {new Date(badge.earnedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unearned Badges Section */}
      {unearnedBadges.length > 0 && (
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg mb-4 flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-300 dark:bg-slate-700 rounded-lg flex items-center justify-center">
              <Lock className="text-slate-500 dark:text-slate-400" size={18} />
            </div>
            Badges to Unlock
            <span className="bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-full text-xs font-bold">
              {unearnedBadges.length}
            </span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {unearnedBadges.map((badge) => (
              <div
                key={badge.id}
                className="bg-white dark:bg-slate-800/50 rounded-xl p-4 text-center border border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-80 transition-opacity"
              >
                <div className="text-4xl mb-3 grayscale opacity-50">{badge.icon}</div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-1">
                  {badge.name}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                  {badge.description}
                </p>
                <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg px-3 py-2 text-xs">
                  {badge.requirementType === "confessions" && (
                    <div className="text-slate-600 dark:text-slate-400">
                      Post <span className="font-bold text-slate-800 dark:text-slate-200">{badge.requirementValue}</span> confessions
                    </div>
                  )}
                  {badge.requirementType === "comments" && (
                    <div className="text-slate-600 dark:text-slate-400">
                      Leave <span className="font-bold text-slate-800 dark:text-slate-200">{badge.requirementValue}</span> comments
                    </div>
                  )}
                  {badge.requirementType === "likes" && (
                    <div className="text-slate-600 dark:text-slate-400">
                      Receive <span className="font-bold text-slate-800 dark:text-slate-200">{badge.requirementValue}</span> likes
                    </div>
                  )}
                  {badge.requirementType === "streak" && (
                    <div className="text-slate-600 dark:text-slate-400">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{badge.requirementValue}</span>-day streak
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {badges.length === 0 && (
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-700 shadow-sm">
          <Award className="mx-auto text-slate-400 dark:text-slate-500 mb-3" size={48} />
          <p className="text-slate-600 dark:text-slate-400 font-medium">No badges available yet</p>
        </div>
      )}
    </div>
  );
}

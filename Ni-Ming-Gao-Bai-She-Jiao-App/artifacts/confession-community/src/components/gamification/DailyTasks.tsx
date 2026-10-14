import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { CheckCircle2, Circle, Star, Clock, Zap, Target } from "lucide-react";

interface DailyTask {
  id: number;
  name: string;
  description: string;
  taskType: string;
  targetCount: number;
  xpReward: number;
  progress: number;
  completed: boolean;
  completedAt?: string;
}

export function DailyTasks() {
  const { isSignedIn, getToken } = useAuth();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchTasks = async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/gamification/daily-tasks", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok)
          throw new Error(`Daily tasks request failed (${res.status})`);
        const data = await res.json();
        if (!cancelled) {
          setTasks(data);
          setError(false);
          window.dispatchEvent(new Event("gamification:updated"));
        }
      } catch (error) {
        console.error("Failed to fetch daily tasks:", error);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTasks();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken, reloadKey]);

  if (!isSignedIn) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 text-center border border-slate-200 dark:border-slate-700 shadow-sm">
        <Clock className="mx-auto text-slate-400 dark:text-slate-500 mb-3" size={40} />
        <p className="text-slate-600 dark:text-slate-400 font-medium">Sign in to see your daily tasks</p>
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
        <p className="text-slate-600 dark:text-slate-400 font-medium">Daily tasks could not be loaded.</p>
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

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const totalXP = tasks.reduce(
    (sum, task) => sum + (task.completed ? task.xpReward : 0),
    0,
  );
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/30 dark:via-teal-950/30 dark:to-cyan-950/30 rounded-2xl p-6 border border-emerald-100 dark:border-emerald-800/50 shadow-lg shadow-emerald-500/10 dark:shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Target className="text-white" size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Daily Tasks</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Complete them all!</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-3 py-1.5 rounded-full text-sm font-bold shadow-lg shadow-amber-500/30 flex items-center gap-1">
            <Zap size={14} />
            +{totalXP} XP
          </div>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="mb-5">
        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium">
          <span>Daily Progress</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{completedCount}/{totalCount} completed</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 h-2.5 rounded-full transition-all duration-700 ease-out shadow-lg shadow-emerald-500/30"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`bg-white dark:bg-slate-800/50 rounded-xl p-4 border shadow-sm transition-all hover:shadow-md ${
              task.completed
                ? "border-emerald-300 dark:border-emerald-700/50 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20"
                : "border-slate-200 dark:border-slate-700"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {task.completed ? (
                  <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <CheckCircle2 className="text-white" size={16} />
                  </div>
                ) : (
                  <div className="w-6 h-6 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center">
                    <Circle className="text-slate-400 dark:text-slate-500" size={16} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h4 className={`font-semibold text-sm ${task.completed ? 'text-emerald-700 dark:text-emerald-300 line-through opacity-75' : 'text-slate-800 dark:text-slate-100'}`}>
                    {task.name}
                  </h4>
                  <div className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full text-xs font-bold">
                    <Zap size={10} />
                    +{task.xpReward}
                  </div>
                </div>
                <p className={`text-xs mb-2 ${task.completed ? 'text-slate-500 dark:text-slate-500' : 'text-slate-600 dark:text-slate-400'}`}>
                  {task.description}
                </p>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Progress: {task.progress}/{task.targetCount}
                  </div>
                </div>
                {/* Progress Bar */}
                <div className="mt-2">
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
                        task.completed
                          ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                          : "bg-gradient-to-r from-blue-500 to-indigo-500"
                      }`}
                      style={{
                        width: `${Math.min((task.progress / task.targetCount) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {tasks.length === 0 && (
        <div className="text-center text-slate-600 dark:text-slate-400 py-8">
          <Star className="mx-auto text-slate-400 dark:text-slate-500 mb-2" size={32} />
          <p className="font-medium">No daily tasks available yet</p>
        </div>
      )}
    </div>
  );
}

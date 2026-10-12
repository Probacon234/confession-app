import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { CheckCircle, Circle, Star, Clock } from "lucide-react";

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
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <Clock className="mx-auto text-gray-400 mb-2" size={32} />
        <p className="text-gray-600">Sign in to see your daily tasks</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        Loading tasks...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <p className="text-gray-600">Daily tasks could not be loaded.</p>
        <button
          className="mt-2 text-sm text-blue-600 underline"
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

  return (
    <div className="bg-gradient-to-br from-green-50 to-teal-50 border border-green-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
          <Star className="text-yellow-500" size={20} />
          Daily Tasks
        </h3>
        <div className="text-sm text-gray-600">
          {completedCount}/{totalCount} completed · +{totalXP} XP
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`bg-white rounded-lg p-4 border ${
              task.completed
                ? "border-green-300 bg-green-50"
                : "border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {task.completed ? (
                    <CheckCircle className="text-green-500" size={20} />
                  ) : (
                    <Circle className="text-gray-400" size={20} />
                  )}
                  <h4 className="font-semibold text-gray-800">{task.name}</h4>
                </div>
                <p className="text-sm text-gray-600 ml-7">{task.description}</p>
                <div className="flex items-center gap-4 mt-2 ml-7">
                  <div className="text-xs text-gray-500">
                    Progress: {task.progress}/{task.targetCount}
                  </div>
                  <div className="text-xs text-yellow-600 font-semibold">
                    +{task.xpReward} XP
                  </div>
                </div>
                {/* Progress Bar */}
                <div className="mt-2 ml-7">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        task.completed ? "bg-green-500" : "bg-blue-500"
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
        <div className="text-center text-gray-600 py-4">
          No daily tasks available yet
        </div>
      )}
    </div>
  );
}

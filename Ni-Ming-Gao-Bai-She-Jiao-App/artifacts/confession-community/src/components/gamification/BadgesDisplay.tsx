import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { Award, Lock } from 'lucide-react';

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

  useEffect(() => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    const fetchBadges = async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/gamification/badges/all', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setBadges(data);
        }
      } catch (error) {
        console.error('Failed to fetch badges:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBadges();
  }, [isSignedIn, getToken]);

  if (!isSignedIn) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <Award className="mx-auto text-gray-400 mb-2" size={32} />
        <p className="text-gray-600">Sign in to track your badges</p>
      </div>
    );
  }

  if (loading) {
    return <div className="bg-gray-50 rounded-lg p-6 text-center">Loading badges...</div>;
  }

  const earnedBadges = badges.filter((b) => b.earned);
  const unearnedBadges = badges.filter((b) => !b.earned);

  return (
    <div className="space-y-6">
      {earnedBadges.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Award className="text-yellow-500" size={20} />
            Earned Badges ({earnedBadges.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {earnedBadges.map((badge) => (
              <div
                key={badge.id}
                className="bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4 text-center"
              >
                <div className="text-3xl mb-2">{badge.icon}</div>
                <h4 className="font-semibold text-gray-800 text-sm">{badge.name}</h4>
                <p className="text-xs text-gray-600 mt-1">{badge.description}</p>
                {badge.earnedAt && (
                  <p className="text-xs text-gray-500 mt-2">
                    Earned {new Date(badge.earnedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {unearnedBadges.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Lock className="text-gray-400" size={20} />
            Badges to Unlock ({unearnedBadges.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {unearnedBadges.map((badge) => (
              <div
                key={badge.id}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center opacity-60"
              >
                <div className="text-3xl mb-2 grayscale">{badge.icon}</div>
                <h4 className="font-semibold text-gray-800 text-sm">{badge.name}</h4>
                <p className="text-xs text-gray-600 mt-1">{badge.description}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {badge.requirementType === 'confessions' && `Post ${badge.requirementValue} confessions`}
                  {badge.requirementType === 'comments' && `Leave ${badge.requirementValue} comments`}
                  {badge.requirementType === 'likes' && `Receive ${badge.requirementValue} likes`}
                  {badge.requirementType === 'streak' && `${badge.requirementValue}-day streak`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {badges.length === 0 && (
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <Award className="mx-auto text-gray-400 mb-2" size={32} />
          <p className="text-gray-600">No badges available yet</p>
        </div>
      )}
    </div>
  );
}

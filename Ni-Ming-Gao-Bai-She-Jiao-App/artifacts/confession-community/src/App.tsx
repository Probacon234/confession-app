import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  useCreateConfession,
  useCreateConfessionComment,
  useGetCommunitySummary,
  useGetConfession,
  useHealthCheck,
  useListConfessionComments,
  useListConfessions,
  useReportConfession,
  useToggleConfessionLike,
  useGetModerationAccess,
  useListModerationReports,
  useUpdateModerationReport,
  getListConfessionsQueryKey,
  getGetConfessionQueryKey,
  getListConfessionCommentsQueryKey,
  getGetCommunitySummaryQueryKey,
  useListAnnouncements,
  useUpdateAnnouncement,
  setAuthTokenGetter,
} from '@workspace/api-client-react';
import type { ConfessionCategory, ReportInputReason } from '@workspace/api-client-react';
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronDown, Feather, Flag, Heart, Menu, MessageCircle, Moon, PenLine, Send, Share2, ShieldCheck, Sparkles, Sun, X } from 'lucide-react';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import { useTheme } from 'next-themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import NotFound from '@/pages/not-found';
import { BadgesDisplay } from '@/components/gamification/BadgesDisplay';
import { LevelDisplay } from '@/components/gamification/LevelDisplay';
import { DailyTasks } from '@/components/gamification/DailyTasks';
import { Notifications } from '@/components/Notifications';

function ReportedItem({ report }: { report: any }) {
  const { data: confession, isLoading } = useGetConfession(report.confessionId);
  const updateReportMutation = useUpdateModerationReport();
  const queryClient = useQueryClient();

  // Handle report status update (e.g. resolve or dismiss)
  const handleUpdateStatus = async (status: string) => {
    try {
      await updateReportMutation.mutateAsync({
        reportId: report.id,
        data: { status } as any,
      });
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error("Action failed: " + (err as Error).message);
    }
  };

  // 1. 在元件內宣告發布到 IG 的處理函式
  const handlePostToInstagram = async (postId: string) => {
  try {
    // 請將這裡換成你在 Render 上的實際後端網址（例如 https://xxxx.onrender.com）
    const RENDER_API_URL = 'https://你的render專案名稱.onrender.com';

    const response = await fetch(`${RENDER_API_URL}/api/moderation/posts/${postId}/post-to-ig`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (response.ok) {
      toast.success('成功發布到 Instagram！');
    } else {
      toast.error(`發布失敗: ${data.error || '未知錯誤'}`);
    }
  } catch (error) {
    console.error('發布到 IG 時發生錯誤:', error);
    toast.error('網路連線錯誤，發布失敗');
  }
  };

 // Delete post directly via API with detailed error logging
  const handleDeletePost = async () => {
    if (!window.confirm("Are you sure you want to delete this post permanently?")) {
      return;
    }
    try {
      let res = await fetch(`${window.location.origin}/api/moderation/confessions/${report.confessionId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      });

      if (res.status === 404) {
        res = await fetch(`${window.location.origin}/api/moderation/posts/${report.confessionId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
        });
      }

      let data: any = null;
      try {
        data = await res.json();
      } catch (e) {
        // Response wasn't JSON
      }

      if (res.ok) {
        toast.success("Post deleted successfully.");
        queryClient.invalidateQueries();
      } else {
        const errorMsg = data?.message || data?.error || `HTTP ${res.status} Error`;
        toast.error("Failed to delete post: " + errorMsg);
      }
    } catch (err) {
      toast.error("Delete failed: " + (err as Error).message);
    }
  };

  // Ban user directly via API by providing the confession ID
  const handleBanUser = async () => {
    // 直接让管理员确认是否封锁该贴文作者
    if (!window.confirm("Are you sure you want to ban the author of this post?")) {
      return;
    }

    try {
      const res = await fetch(`${window.location.origin}/api/moderation/users/ban`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        // 关键：这里直接传 report.confessionId 给后端
        body: JSON.stringify({ confessionId: report.confessionId }),
      });

      if (res.ok) {
        toast.success("User banned successfully.");
        // 如果有用到 react-query，这里刷新列表
        // queryClient.invalidateQueries();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(`Failed to ban user: ${data?.message || 'Unknown error'} (HTTP ${res.status})`);
      }
    } catch (err) {
      toast.error("Ban failed: " + (err as Error).message);
    }
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white border-red-100 mb-4">
      <div className="flex justify-between items-center text-xs text-gray-400 mb-2 border-b pb-2">
        <span>Report ID: {report.id}</span>
        <span>Target Post ID: {report.confessionId}</span>
        <span className="font-semibold text-blue-600">Status: {report.status || "pending"}</span>
      </div>

      {/* Report Reason */}
      <div className="mb-3 bg-red-50 p-2 rounded text-sm">
        <span className="font-bold text-red-600">Report Reason: </span>
        <span className="text-red-800">{report.reason}</span>
        {report.details && (
          <p className="text-gray-600 text-xs mt-1">Details: {report.details}</p>
        )}
      </div>

      {/* Target Post Content */}
      <div className="bg-gray-50 p-3 rounded border mb-3">
        <div className="text-xs font-bold text-gray-500 mb-1">📄 Post Content:</div>
        {isLoading ? (
          <div className="text-xs text-gray-400">Loading post details...</div>
        ) : confession ? (
          <div>
            <p className="text-gray-800 text-sm whitespace-pre-wrap">
              {(confession as any).content || (confession as any).text || "(No Content)"}
            </p>
            <div className="mt-2 text-xs text-gray-400 flex gap-4">
              {(confession as any).category && <span>Category: {(confession as any).category}</span>}
              {(confession as any).createdAt && (
                <span>Posted At: {new Date((confession as any).createdAt).toLocaleString()}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-red-400">(This post has been deleted or does not exist)</div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end pt-2 border-t flex-wrap">
        {/* 【功能標記：發布到 Instagram】
  * 作用：讓管理員在審核貼文時，點擊即可直接將這則告白（透過 report.id）發布到綁定的 Instagram 帳號。
  */}
        <button
            onClick={() => handlePostToInstagram(report.id)}
            className="px-3 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 font-medium"
        >
          📸 Post to Instagram
        </button>
        <button
          onClick={handleDeletePost}
          className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
        >
          🗑️ Delete Post
        </button>
        <button
          onClick={handleBanUser}
          className="px-3 py-1 bg-black text-white rounded text-xs hover:bg-gray-800"
        >
          🚫 Ban User
        </button>
        <button
          onClick={() => handleUpdateStatus("resolved")}
          disabled={updateReportMutation.isPending}
          className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
        >
          {updateReportMutation.isPending ? "Processing..." : "✅ Mark as Resolved"}
        </button>
        <button
          onClick={() => handleUpdateStatus("dismissed")}
          disabled={updateReportMutation.isPending}
          className="px-3 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600 disabled:opacity-50"
        >
          🚫 Dismiss Report
        </button>
      </div>
    </div>
  );
}

function ModerationPage() {
  // 1. 【必須放最上面】狀態宣告
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  // 2. 接著才是資料請求與 loading 判斷
  const { data: access, isLoading: accessLoading } = useGetModerationAccess();
  const { data: reportsData, isLoading: reportsLoading } = useListModerationReports({});
  const { data: announcements } = useListAnnouncements();
  const updateAnnouncementMutation = useUpdateAnnouncement();
  const queryClient = useQueryClient();

  if (accessLoading || reportsLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  const accessResult = access as any;
  if (!accessResult?.allowed) {
    return (
      <div className="p-8 text-center text-red-500">
        Access Denied. Please ensure your email is added to the CONFESSION_MODERATOR_EMAILS environment variable.
      </div>
    );
  }

  // ... 接下來才是原本的 return 畫面

  // ==========================================
  // 公告表單狀態與發送邏輯
  // ==========================================


  const handlePostAnnouncement = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Please fill in the title and content of the announcement!");
      return;
    }

    setIsSubmitting(true);
    try {
      // 呼叫我們剛才寫好的後端 API
      const res = await fetch("/api/moderation/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, authorId: "Admin" }),
      });

      if (!res.ok) throw new Error("Failed to publish announcement");

      toast.success("🎉 Announcement published successfully!");
      setTitle("");   // 清空輸入框
      setContent(""); // 清空輸入框
      queryClient.invalidateQueries();
    } catch (error) {
      console.error(error);
      toast.error("Failed to publish announcement. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditAnnouncement = (announcement: any) => {
    setEditingId(announcement.id);
    setEditTitle(announcement.title);
    setEditContent(announcement.content);
  };

  const handleUpdateAnnouncement = async (id: number) => {
    if (!editTitle.trim() || !editContent.trim()) {
      toast.error("Title and content cannot be empty!");
      return;
    }

    try {
      await updateAnnouncementMutation.mutateAsync({
        id,
        data: { title: editTitle, content: editContent },
      });
      toast.success("Announcement updated successfully!");
      setEditingId(null);
      setEditTitle("");
      setEditContent("");
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error("Failed to update announcement: " + (error as Error).message);
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await updateAnnouncementMutation.mutateAsync({
        id,
        data: { isActive: !isActive },
      });
      toast.success(isActive ? "Announcement hidden" : "Announcement published");
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error("Failed to toggle announcement: " + (error as Error).message);
    }
  };

  const reports = (reportsData as any)?.reports || (reportsData as any) || [];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">CONFESSIONMIIT Report Management Backend</h1>
      {/* 發佈公告區塊 */}
        <div className="mb-8 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h2 className="text-lg font-bold mb-4 text-gray-800">📢 Publish system announcement</h2>
          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Announcement title (e.g., System Maintenance Notice)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="p-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
            <textarea
              placeholder="Announcement content..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="p-2 border border-gray-300 rounded min-h-[100px] focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handlePostAnnouncement}
              disabled={isSubmitting}
              className="self-start bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? "Publishing..." : "Publish Announcement"}
            </button>
          </div>
        </div>

        {/* 公告列表區塊 */}
        <div className="mb-8 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h2 className="text-lg font-bold mb-4 text-gray-800">📋 Announcement Management</h2>
          {!announcements || announcements.length === 0 ? (
            <p className="text-gray-500">No announcements yet.</p>
          ) : (
            <div className="space-y-4">
              {announcements.map((announcement: any) => (
                <div key={announcement.id} className="border border-gray-200 rounded p-4">
                  {editingId === announcement.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded min-h-[80px] focus:outline-none focus:border-blue-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateAnnouncement(announcement.id)}
                          disabled={updateAnnouncementMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
                        >
                          {updateAnnouncementMutation.isPending ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{announcement.title}</h3>
                          <p className="text-gray-700 text-sm mt-1 whitespace-pre-wrap">{announcement.content}</p>
                          <p className="text-gray-500 text-xs mt-2">
                            {new Date(announcement.createdAt).toLocaleString()}
                            {announcement.isActive ? (
                              <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Active</span>
                            ) : (
                              <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">Hidden</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleEditAnnouncement(announcement)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(announcement.id, announcement.isActive)}
                          className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                        >
                          {announcement.isActive ? "Hide" : "Publish"}
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm("Are you sure you want to delete this announcement?")) return;
                            try {
                              const res = await fetch(`/api/moderation/announcements/${announcement.id}`, {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                              });
                              if (res.ok) {
                                toast.success("Announcement deleted successfully.");
                                queryClient.invalidateQueries();
                              } else {
                                toast.error("Deletion failed. Please check if you have administrator privileges.");
                              }
                            } catch (error) {
                              toast.error("Failed to delete announcement: " + (error as Error).message);
                            }
                          }}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 下方原本的檢舉列表加上一個小標題來區分 */}
        <h2 className="text-lg font-bold mb-4 text-gray-800">🚨 Report Management List</h2>
      {!Array.isArray(reports) || reports.length === 0 ? (
        <p className="text-gray-500">No reports found at the moment.</p>
      ) : (
        <div>
          {reports.map((report: any) => (
            <ReportedItem key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  ? publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
  : undefined;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const categories: { value: ConfessionCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Semua cerita' }, { value: 'love', label: 'Cinta' },
  { value: 'friendship', label: 'Persahabatan' }, { value: 'family', label: 'Keluarga' },
  { value: 'school', label: 'Belajar' }, { value: 'work', label: 'Kerja' }, { value: 'life', label: 'Hidup' }, { value: 'admin', label: 'ADMIN' },
];
const englishCategories: Record<ConfessionCategory, string> = {
  love: 'Love', friendship: 'Friendship', family: 'Family', school: 'School', work: 'Work', life: 'Life', admin: 'ADMIN',
};
const categoryColors: Record<ConfessionCategory, string> = {
  love: 'rose', friendship: 'sage', family: 'honey', school: 'sky', work: 'plum', life: 'olive', admin: 'plum',
};

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const nextId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== nextId) cache.clear();
      previousUserId.current = nextId;
    });
    return unsubscribe;
  }, [addListener, cache]);
  return null;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: '#3f7163', colorForeground: '#29463e', colorMutedForeground: '#71847c',
    colorDanger: '#b84d43', colorBackground: '#fcfaf5', colorInput: '#f6f1e8',
    colorInputForeground: '#29463e', colorNeutral: '#d9d4c9', fontFamily: "'DM Sans', sans-serif",
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fcfaf5] rounded-[24px] w-full max-w-[440px] overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#29463e] font-semibold tracking-tight',
    headerSubtitle: 'text-[#71847c]',
    socialButtonsBlockButtonText: 'text-[#29463e] font-medium',
    formFieldLabel: 'text-[#29463e] font-medium',
    footerActionLink: 'text-[#3f7163] font-semibold',
    footerActionText: 'text-[#71847c]',
    dividerText: 'text-[#71847c]',
    identityPreviewEditButton: 'text-[#3f7163]',
    formFieldSuccessText: 'text-[#3f7163]',
    alertText: 'text-[#92453e]',
    logoBox: 'mb-5',
    logoImage: 'rounded-xl',
    socialButtonsBlockButton: 'border-[#ded9ce] bg-[#f8f4eb] hover:bg-[#f1ebdf] rounded-xl',
    formButtonPrimary: 'bg-[#3f7163] hover:bg-[#345e52] rounded-xl shadow-none',
    formFieldInput: 'bg-[#f8f4eb] border-[#ded9ce] text-[#29463e] rounded-xl',
    footerAction: 'border-0',
    dividerLine: 'bg-[#ded9ce]',
    alert: 'rounded-xl',
    otpCodeFieldInput: 'bg-[#f8f4eb] border-[#ded9ce] text-[#29463e] rounded-xl',
    formFieldRow: 'mb-4',
    main: 'gap-4',
  },
};

function PageErrorBoundary({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  return <ErrorBoundary resetKey={path}>{children}</ErrorBoundary>;
}

function Brand({ small = false }: { small?: boolean }) {
  const { isSignedIn } = useUser();
  return <Link href={isSignedIn ? '/wall' : '/'} className={`brand-lockup ${small ? 'brand-small' : ''}`} aria-label="CONFESSIONMIIT 首頁" data-testid="link-home-brand">
    <span className="brand-mark"><span /></span><span className="brand-type"><b>CONFESSIONMIIT</b><small>LET IT OUT, GENTLY</small></span>
  </Link>;
}

function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const { theme, setTheme } = useTheme();
  return <header className="site-header">
    <div className="header-inner">
      <Brand />
      <nav className={`main-nav ${menuOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
        <a href={isSignedIn ? '/wall#the-wall' : '#the-wall'} onClick={() => setMenuOpen(false)}>The wall</a>
        <a href={isSignedIn ? '/wall#our-promise' : '#our-promise'} onClick={() => setMenuOpen(false)}>Our promise</a>
        <Show when="signed-in"><Link href="/user-portal" onClick={() => setMenuOpen(false)}>Your space</Link></Show>
      </nav>
      <div className="header-actions">
        <button
          className="icon-button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle dark mode"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <Show when="signed-in">
          <Notifications />
        </Show>
        <Show when="signed-out">
          <Link href="/sign-in" className="text-action">Sign in</Link>
          <Link href="/sign-up" className="header-cta">Join the wall <ArrowRight size={15} /></Link>
        </Show>
        <Show when="signed-in">
          <Link href="/user-portal" className="user-chip" data-testid="link-user-portal"><span className="user-dot">{user?.firstName?.slice(0, 1) ?? 'CONFESSIONMIIT'}</span><span>My space</span></Link>
          <button className="sign-out-button" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button>
        </Show>
      </div>
      <button className="menu-toggle icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} data-testid="button-mobile-menu">
        {menuOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
    </div>
  </header>;
}

function HomePage() {
  const [category, setCategory] = useState<ConfessionCategory | 'all'>('all');
  const [sort, setSort] = useState<'latest' | 'popular'>('latest');
  const { isSignedIn, getToken } = useAuth();
const { data: moderationAccess } = useGetModerationAccess({ query: { enabled: Boolean(isSignedIn), retry: false } as any });
const isAdmin = Boolean((moderationAccess as any)?.allowed);
  const { openSignIn } = useClerk();
  const [composeOpen, setComposeOpen] = useState(false);
  const [reportId, setReportId] = useState<number | null>(null);
const [submitting, setSubmitting] = useState(false);
const [submitFailed, setSubmitFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [, setLocation] = useLocation();
  const params = { sort, ...(category === 'all' ? {} : { category }) };
  const feed = useListConfessions(params);
  const summary = useGetCommunitySummary();
  const health = useHealthCheck();
  const { data: announcements } = useListAnnouncements();
  const cache = useQueryClient();
  const create = useCreateConfession({ mutation: { onSuccess: async () => {
    await Promise.all([cache.invalidateQueries({ queryKey: getListConfessionsQueryKey() }), cache.invalidateQueries({ queryKey: getGetCommunitySummaryQueryKey() })]);
    setComposeOpen(false); setNotice('Your words have found a place on the wall.');
  } } });
  const like = useToggleConfessionLike({ mutation: { onSuccess: async () => {
    await Promise.all([cache.invalidateQueries({ queryKey: getListConfessionsQueryKey() }), cache.invalidateQueries({ queryKey: getGetCommunitySummaryQueryKey() })]);
  } } });

  const startCompose = () => setComposeOpen(true);

  const handleShare = async (id: number) => {
    const shareUrl = `${window.location.origin}/confessions/${id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard!");
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  return <div className="page-shell grain">
    <SiteHeader />
    <main>
      <section className="hero-wrap">
        <div className="hero-copy fade-up">
          <span className="eyebrow"><span className="pulse-dot" /> A little room for all of it</span>
          <h1 className="serif">Some things are<br /><em>easier to say</em><br />when no one knows.</h1>
          <p>A quiet corner of the internet for the things you carry. Share a little or a lot. We'll hold it gently, together.</p>
          <button className="primary-button hero-button" onClick={startCompose} data-testid="button-write-confession"><PenLine size={17} /> Leave something here <ArrowRight size={16} /></button>
          <div className="hero-note"><ShieldCheck size={15} /> No names. No profiles. Just people listening.</div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun-disc" />
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="paper-note float-slow"><span className="paper-rule" /><span className="paper-rule short" /><Heart className="paper-mark" size={20} /></div>
          <div className="hero-caption"><span>01 / 06</span><span>Every feeling belongs.</span></div>
          <div className="art-flower flower-a"><i /><i /><i /><i /><b /></div>
          <div className="art-flower flower-b"><i /><i /><i /><i /><b /></div>
          <div className="art-line" />
        </div>
      </section>

      <section className="community-strip" aria-label="Community activity">
        <div className="community-label"><span className={`live-dot ${health.isError ? 'offline-dot' : ''}`} /> {health.isError ? 'Reconnecting to the wall' : 'The wall is listening'}</div>
        {summary.isLoading ? <div className="summary-skeleton"><i /><i /><i /></div> : summary.isError ?
          <button className="summary-retry" onClick={() => summary.refetch()}>Community pulse unavailable · try again</button> :
          <div className="community-stats">
            <div><b>{summary.data?.totalConfessions?.toLocaleString() ?? '—'}</b><span>stories held</span></div>
            <div><b>{summary.data?.confessionsToday?.toLocaleString() ?? '—'}</b><span>shared today</span></div>
            <div><b>{summary.data?.totalLikes?.toLocaleString() ?? '—'}</b><span>quiet nods</span></div>
          </div>}
        <span className="strip-aside">Across Malaysia, one honest moment at a time.</span>
      </section>

      {announcements && announcements.length > 0 && (
        <section className="max-w-4xl mx-auto px-6 py-4">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <Sparkles className="text-blue-600 mt-1" size={20} />
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900 mb-1">{announcement.title}</h3>
                  <p className="text-blue-800 text-sm whitespace-pre-wrap">{announcement.content}</p>
                  <p className="text-blue-600 text-xs mt-2">
                    {new Date(announcement.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="wall-section" id="the-wall">
        <div className="feed-main">
          <div className="section-heading">
            <div><span className="eyebrow muted-eyebrow">FROM THE COMMUNITY</span><h2 className="serif">The wall</h2></div>
            <div className="sort-control"><span>Showing</span><button onClick={() => setSort(sort === 'latest' ? 'popular' : 'latest')} data-testid="button-sort-feed">{sort === 'latest' ? 'Most recent' : 'Most held'} <ChevronDown size={14} /></button></div>
          </div>
          <div className="category-tabs" role="tablist" aria-label="Filter by feeling">
            {categories.map(item => <button key={item.value} role="tab" aria-selected={category === item.value} className={category === item.value ? 'category-active' : ''} onClick={() => setCategory(item.value)} data-testid={`filter-category-${item.value}`}>{item.label}</button>)}
          </div>
          {notice && <div className="inline-success" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
          {feed.isLoading ? <FeedSkeleton /> : feed.isError ? <ErrorState retry={() => feed.refetch()} /> :
            (feed.data?.length ?? 0) === 0 ? <EmptyFeed category={category} onWrite={startCompose} /> :
              <div className="confession-list">
                {feed.data?.map((item, index) => <article className="confession-card" key={item.id} style={{ animationDelay: `${index * 65}ms` }} data-testid={`card-confession-${item.id}`}>
                  <div className="card-topline"><span className={`category-tag tag-${categoryColors[item.category]}`}>{englishCategories[item.category]}</span><span className="time-stamp">{timeAgo(item.createdAt)}</span></div>
                  <Link href={`/confessions/${item.id}`} className="confession-copy serif" data-testid={`link-confession-${item.id}`}>{item.content}</Link>
                  <div className="card-bottom">
                    <button className={`card-action ${item.likedByMe ? 'liked' : ''}`} onClick={() => isSignedIn ? like.mutate({ id: item.id }) : setLocation('/sign-in')} disabled={like.isPending} aria-label={item.likedByMe ? 'Remove care' : 'Send care'} data-testid={`button-like-${item.id}`}><Heart size={17} fill={item.likedByMe ? 'currentColor' : 'none'} /><span>{item.likes}</span><span className="action-label">{item.likedByMe ? 'You held this' : 'I hear you'}</span></button>
                    <Link href={`/confessions/${item.id}`} className="card-action" data-testid={`link-comments-${item.id}`}><MessageCircle size={17} /><span>{item.commentsCount}</span><span className="action-label">gentle words</span></Link>
                    <button className="card-action" onClick={() => handleShare(item.id)} aria-label="Share this story" data-testid={`button-share-${item.id}`}><Share2 size={17} /><span className="action-label">Share</span></button>
                    <button className="report-trigger" onClick={() => isSignedIn ? setReportId(item.id) : setLocation('/sign-in')} aria-label="Report this story" data-testid={`button-report-${item.id}`}><Flag size={15} /></button>
                  </div>
                </article>)}
              </div>}
          <div className="feed-end"><span /><p>You've reached this moment.</p><span /></div>
        </div>
        <aside className="wall-aside">
          <div className="aside-card note-card" id="our-promise">
            <span className="aside-mark"><ShieldCheck size={19} /></span>
            <span className="eyebrow muted-eyebrow">OUR PROMISE</span>
            <h3 className="serif">A name is never<br />the point.</h3>
            <p>Every story and reply here is anonymous. No profiles, no follower counts, no performing. Just a person, and another person listening.</p>
            <a href="#the-wall" className="aside-link">How this place works <ArrowRight size={15} /></a>
          </div>
          <div className="aside-quote"><span className="quote-mark">“</span><p>You don't have to have the right words. You only have to have your own.</p><span className="quote-credit">A note from this community</span></div>
          <div className="aside-writing">
            <span className="writing-icon"><Feather size={17} /></span><div><b>Something on your mind?</b><span>It's safe to put it down.</span></div><button onClick={startCompose} aria-label="Write a confession" data-testid="button-aside-write"><ArrowRight size={17} /></button>
          </div>
        </aside>
      </section>
      <Footer />
    </main>
    {composeOpen && (
  <ComposeModal
    close={() => setComposeOpen(false)}
    isAdmin={isAdmin}
    error={submitFailed}
    pending={submitting}
    onSubmit={(data) => {
      if (submitting) return;
      if (!isSignedIn) {
        openSignIn();
        return;
      }

      void (async () => {
        setSubmitting(true);
        setSubmitFailed(false);
        try {
          const token = await getToken({ skipCache: true });
          if (!token) {
            openSignIn();
            return;
          }

          const res = await fetch('/api/confessions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(data),
          });

          if (res.ok) {
            setComposeOpen(false);
            setNotice('Your words have found a place on the wall.');
            cache.invalidateQueries({ queryKey: getListConfessionsQueryKey() });
          } else {
            console.error('Create confession failed:', res.status);
            setSubmitFailed(true);
          }
        } catch (err) {
          console.error('Fetch error:', err);
          setSubmitFailed(true);
        } finally {
          setSubmitting(false);
        }
      })();
    }}
  />
)}

    {reportId !== null && <ReportModal id={reportId} close={() => setReportId(null)} onSuccess={() => setNotice('Thank you. Your report has been received with care.')} />}
  </div>;
}

function UserPortalPage() {
  const { getToken } = useAuth();
  const [myConfessions, setMyConfessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState<ConfessionCategory>("life");
  const [isSaving, setIsSaving] = useState(false);
  const cache = useQueryClient();

  const loadMyConfessions = async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/my-confessions", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setMyConfessions(data);
      }
    } catch (error) {
      console.error("Failed to load confessions:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyConfessions();
  }, []);

  const handleDeleteConfession = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this confession? This action cannot be undone.")) {
      return;
    }

    try {
      const token = await getToken();
      const res = await fetch(`/api/moderation/confessions/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        toast.success("Confession deleted successfully.");
        setMyConfessions((prev) => prev.filter((c) => c.id !== id));
        cache.invalidateQueries();
      } else {
        toast.error("Failed to delete confession.");
      }
    } catch (error) {
      toast.error("Delete failed: " + (error as Error).message);
    }
  };

  const handleEditConfession = (confession: any) => {
    setEditingId(confession.id);
    setEditContent(confession.content);
    setEditCategory(confession.category);
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) {
      toast.error("Content cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/confessions/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: editContent,
          category: editCategory,
        }),
      });

      if (res.ok) {
        toast.success("Confession updated successfully.");
        setMyConfessions((prev) =>
          prev.map((c) =>
            c.id === editingId
              ? { ...c, content: editContent, category: editCategory }
              : c
          )
        );
        setEditingId(null);
        setEditContent("");
        cache.invalidateQueries();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update confession");
      }
    } catch (error) {
      toast.error("Update failed: " + (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent("");
    setEditCategory("life");
  };

  const canEdit = (confession: any) => {
    const createdAt = new Date(confession.createdAt);
    const now = new Date();
    const timeDiff = now.getTime() - createdAt.getTime();
    const thirtyMinutes = 30 * 60 * 1000;
    return timeDiff <= thirtyMinutes;
  };

  return <div className="page-shell"><SiteHeader /><main className="portal-main">
    <div className="portal-banner"><span className="eyebrow"><Sparkles size={14} /> YOUR QUIET CORNER</span><h1 className="serif">Welcome back to<br /><em>the wall.</em></h1><p>Nothing here is tied to your name. Your presence simply lets you leave a little care behind.</p><Link className="primary-button" href="/wall"><ArrowLeft size={16} /> Return to the wall</Link></div>
    <div className="portal-prompt"><span className="portal-prompt-icon"><PenLine size={19} /></span><div><span className="eyebrow muted-eyebrow">WHENEVER YOU'RE READY</span><h2 className="serif">What's sitting with you?</h2><p>Put it into words, at your own pace. You can share it without sharing who you are.</p></div><Link href="/wall" className="portal-arrow" aria-label="Go to the wall"><ArrowRight size={19} /></Link></div>
    <div className="portal-note"><ShieldCheck size={18} /><p><b>Your account is only for keeping this space safe.</b> Your name never appears beside a confession, a comment, or a like.</p></div>

    {/* 遊戲化功能區塊 - 優化後的佈局 */}
    <div className="max-w-6xl mx-auto mt-8 px-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LevelDisplay />
        <DailyTasks />
      </div>
    </div>

    <div className="max-w-6xl mx-auto mt-6 px-6">
      <BadgesDisplay />
    </div>

    {/* 用戶自己的告白列表 - 優化後的佈局 */}
    <div className="max-w-6xl mx-auto mt-8 px-6 pb-12">
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <PenLine className="text-white" size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">My Confessions</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Manage your shared stories</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mx-auto mb-4"></div>
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mx-auto"></div>
            </div>
          </div>
        ) : myConfessions.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <PenLine className="text-slate-400 dark:text-slate-500" size={32} />
            </div>
            <p className="text-slate-600 dark:text-slate-400 font-medium mb-2">You haven't shared any confessions yet.</p>
            <Link href="/wall" className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
              Share your first confession <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {myConfessions.map((confession) => (
              <div key={confession.id} className="bg-white dark:bg-slate-800/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                {editingId === confession.id ? (
                  <div className="space-y-4">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 min-h-[120px] resize-none"
                      maxLength={1200}
                      placeholder="Edit your confession..."
                    />
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as ConfessionCategory)}
                      className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                    >
                      {categories.filter(item => item.value !== 'all' && item.value !== 'admin').map(item => (
                        <option value={item.value} key={item.value}>{item.label}</option>
                      ))}
                    </select>
                    <div className="flex gap-3">
                      <button
                        onClick={handleSaveEdit}
                        disabled={isSaving}
                        className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-green-500/30"
                      >
                        {isSaving ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-4 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={`category-tag tag-${categoryColors[confession.category as ConfessionCategory]} px-3 py-1 rounded-full text-xs font-semibold`}>
                          {englishCategories[confession.category as ConfessionCategory]}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          {timeAgo(confession.createdAt)}
                        </span>
                        {confession.igStatus === 'published' && (
                          <span className="inline-flex items-center gap-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-full font-medium">
                            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                            Posted to IG
                          </span>
                        )}
                        {!canEdit(confession) && (
                          <span className="text-xs text-slate-400 dark:text-slate-500 italic">Edit expired</span>
                        )}
                      </div>
                      <p className="text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">{confession.content}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {canEdit(confession) && (
                        <button
                          onClick={() => handleEditConfession(confession)}
                          className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                          title="Edit confession"
                        >
                          <PenLine size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteConfession(confession.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Delete confession"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </main><Footer /></div>;
}

function ConfessionPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const confession = useGetConfession(id);
  const comments = useListConfessionComments(id);
  const cache = useQueryClient();
  const { isSignedIn } = useUser();
  const [, setLocation] = useLocation();
  const [content, setContent] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const createComment = useCreateConfessionComment({ mutation: { onSuccess: async () => {
    setContent('');
    await Promise.all([
      cache.invalidateQueries({ queryKey: getListConfessionCommentsQueryKey(id) }),
      cache.invalidateQueries({ queryKey: getGetConfessionQueryKey(id) }),
      cache.invalidateQueries({ queryKey: getListConfessionsQueryKey() }),
    ]);
  } } });
  const like = useToggleConfessionLike({ mutation: { onSuccess: async () => {
    await Promise.all([cache.invalidateQueries({ queryKey: getGetConfessionQueryKey(id) }), cache.invalidateQueries({ queryKey: getListConfessionsQueryKey() }), cache.invalidateQueries({ queryKey: getGetCommunitySummaryQueryKey() })]);
  } } });

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/confessions/${id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard!");
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  const submitComment = (event: FormEvent) => { event.preventDefault(); if (!isSignedIn) { setLocation('/sign-in'); return; } if (content.trim()) createComment.mutate({ id, data: { content: content.trim() } }); };
  return <div className="page-shell"><SiteHeader /><main className="detail-main">
    <Link href="/wall" className="back-link"><ArrowLeft size={16} /> Back to the wall</Link>
    {confession.isLoading ? <div className="detail-skeleton"><i /><i /><i /></div> : confession.isError || !confession.data ? <ErrorState retry={() => confession.refetch()} /> :
      <>
        <article className="detail-story">
          <div className="card-topline"><span className={`category-tag tag-${categoryColors[confession.data.category]}`}>{englishCategories[confession.data.category]}</span><span className="time-stamp">{timeAgo(confession.data.createdAt)}</span></div>
          <p className="detail-content serif" data-testid={`text-confession-${id}`}>{confession.data.content}</p>
          <div className="detail-actions">
            <button className={`card-action ${confession.data.likedByMe ? 'liked' : ''}`} onClick={() => isSignedIn ? like.mutate({ id }) : setLocation('/sign-in')} disabled={like.isPending} data-testid="button-detail-like"><Heart size={18} fill={confession.data.likedByMe ? 'currentColor' : 'none'} /><span>{confession.data.likes}</span><span className="action-label">I hear you</span></button>
            <span className="card-action static"><MessageCircle size={17} /><span>{confession.data.commentsCount}</span><span className="action-label">gentle words</span></span>
            <button className="card-action" onClick={handleShare} aria-label="Share this story" data-testid="button-detail-share"><Share2 size={17} /><span className="action-label">Share</span></button>
            <button className="report-trigger" onClick={() => isSignedIn ? setReportOpen(true) : setLocation('/sign-in')} aria-label="Report this story" data-testid="button-detail-report"><Flag size={15} /> Report</button>
          </div>
        </article>
        <section className="comments-section">
          <div className="comments-heading"><div><span className="eyebrow muted-eyebrow">A LITTLE CARE, LEFT HERE</span><h2 className="serif">Gentle words <span>({comments.data?.length ?? 0})</span></h2></div><span className="comment-privacy"><ShieldCheck size={15} /> All anonymous</span></div>
          <form className="comment-form" onSubmit={submitComment}>
            <label htmlFor="reply-box" className="sr-only">Write a caring reply</label>
            <textarea id="reply-box" value={content} onChange={event => setContent(event.target.value)} maxLength={500} placeholder="If you could sit beside this person, what might you say?" data-testid="input-comment" />
        <div className="comment-form-bottom"><span>{content.length}/500 · Your words stay anonymous</span><button type="submit" className="primary-button" disabled={!content.trim() || createComment.isPending} data-testid="button-submit-comment">{createComment.isPending ? 'Sending…' : 'Leave a gentle word'} <Send size={15} /></button></div>
            {createComment.isError && <p className="form-error">That reply could not be sent. Please try again.</p>}
          </form>
          {comments.isLoading ? <div className="comment-skeletons"><i /><i /></div> : comments.isError ? <ErrorState retry={() => comments.refetch()} /> :
            comments.data?.length ? <div className="comment-list">{comments.data.map(comment => <article className="comment-item" key={comment.id} data-testid={`comment-${comment.id}`}><span className="comment-stem" /><div className="comment-body"><p>{comment.content}</p><time>{timeAgo(comment.createdAt)}</time></div></article>)}</div> :
              <div className="empty-comments"><span className="empty-star" aria-hidden="true" /><p>No words here yet. Yours could be the first soft landing.</p></div>}
        </section>
      </>}
    <div className="detail-footnote"><span className="small-seal"><ShieldCheck size={16} /></span><p>This is a human space. Read with kindness, reply with care, and remember there is a real person on the other side.</p></div>
    {notice && <div className="inline-success" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
  </main><Footer />{reportOpen && <ReportModal id={id} close={() => setReportOpen(false)} onSuccess={() => setNotice('Thank you. Your report has been received with care.')} />}</div>;
}

function ComposeModal({ close, onSubmit, pending, error, isAdmin }: { close: () => void; onSubmit: (data: { content: string; category: ConfessionCategory }) => void; pending: boolean; error: boolean; isAdmin: boolean }) {
  const { isSignedIn } = useUser();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<ConfessionCategory>('life');
  const [signInPrompt, setSignInPrompt] = useState(false);
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isSignedIn) { setSignInPrompt(true); return; }
    if (text.trim()) onSubmit({ content: text.trim(), category });
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && close()}>
    <section className="compose-modal" role="dialog" aria-modal="true" aria-labelledby="compose-title">
      <button className="modal-close" onClick={close} aria-label="Close compose dialog" data-testid="button-close-compose"><X size={20} /></button>
      <span className="eyebrow muted-eyebrow">A PRIVATE THOUGHT, HELD IN PUBLIC</span>
      <h2 id="compose-title" className="serif">Leave something<br /><em>here.</em></h2>
      <p className="modal-intro">No name attached. No perfect phrasing needed. Just you, putting it down.</p>
      <form onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="confession-text">Your words</label>
        <textarea id="confession-text" className="compose-textarea" maxLength={1200} value={text} onChange={event => setText(event.target.value)} placeholder="I've been meaning to say…" autoFocus data-testid="input-confession-content" />
        <div className="form-meta"><span>Take your time</span><span>{text.length}/1200</span></div>
        <label className="field-label" htmlFor="confession-category">What does it touch?</label>
        <select id="confession-category" value={category} onChange={event => setCategory(event.target.value as ConfessionCategory)} data-testid="select-confession-category">
          {categories.filter(item => item.value !== 'all' && (item.value !== 'admin' || isAdmin)).map(item => <option value={item.value} key={item.value}>{item.value === 'admin' ? 'ADMIN' : `${item.label} · ${englishCategories[item.value as ConfessionCategory]}`}</option>)}
        </select>
        {signInPrompt && <div className="sign-in-callout">To share or respond, please <Link href="/sign-in" onClick={close}>sign in</Link>. Your name still stays with you.</div>}
        {error && <p className="form-error">We couldn't place this on the wall just yet. Please try again.</p>}
        <div className="modal-submit-row"><span className="privacy-hint"><ShieldCheck size={15} /> Always anonymous</span><button type="submit" className="primary-button" disabled={!text.trim() || pending} data-testid="button-publish-confession">{pending ? 'Placing it…' : 'Place it on the wall'} <ArrowRight size={15} /></button></div>
      </form>
    </section>
  </div>;
}

function ReportModal({ id, close, onSuccess }: { id: number; close: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState<ReportInputReason>('harmful');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);
  const report = useReportConfession({ mutation: { onSuccess: () => { setDone(true); onSuccess(); } } });
  const submit = (event: FormEvent) => { event.preventDefault(); report.mutate({ id, data: { reason, ...(details.trim() ? { details: details.trim() } : {}) } }); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && close()}><section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
    <button className="modal-close" onClick={close} aria-label="Close report dialog"><X size={19} /></button>
    {done ? <div className="report-done"><span><Check size={19} /></span><h2 className="serif">Thank you for looking out.</h2><p>Our small team will review this quietly and carefully.</p><button className="primary-button" onClick={close}>Done</button></div> :
      <><span className="eyebrow muted-eyebrow">KEEPING THIS SPACE SAFE</span><h2 id="report-title" className="serif">Something doesn't<br />feel right?</h2><p className="modal-intro">Tell us what you noticed. Reports are private and reviewed with care.</p><form onSubmit={submit}>
        <label className="field-label" htmlFor="report-reason">What is the concern?</label><select id="report-reason" value={reason} onChange={event => setReason(event.target.value as ReportInputReason)} data-testid="select-report-reason"><option value="harmful">Harmful or unsafe</option><option value="harassment">Harassment</option><option value="spam">Spam</option><option value="other">Something else</option></select>
        <label className="field-label" htmlFor="report-details">Anything else? <span>optional</span></label><textarea id="report-details" className="report-details" maxLength={500} value={details} onChange={event => setDetails(event.target.value)} placeholder="A little context helps us understand." data-testid="input-report-details" />
        {!report.isPending && report.isError && <p className="form-error">Your report couldn't be sent. Please try again.</p>}
        <button className="primary-button report-submit" type="submit" disabled={report.isPending} data-testid="button-submit-report">{report.isPending ? 'Sending privately…' : 'Send report'} <ArrowRight size={15} /></button>
      </form></>}
  </section></div>;
}

function FeedSkeleton() {
  return <div className="confession-list" aria-label="Loading stories"><div className="story-skeleton"><i /><i /><i /><i /></div><div className="story-skeleton"><i /><i /><i /><i /></div><div className="story-skeleton"><i /><i /><i /><i /></div></div>;
}
function ErrorState({ retry }: { retry: () => void }) {
  return <div className="state-card error-state"><span className="state-symbol"><ArrowDown size={19} /></span><h3 className="serif">A little pause in the signal.</h3><p>The wall is still here. We just couldn't reach it right now.</p><button onClick={retry} className="secondary-button" data-testid="button-retry">Try again <ArrowRight size={14} /></button></div>;
}
function EmptyFeed({ category, onWrite }: { category: ConfessionCategory | 'all'; onWrite: () => void }) {
  return <div className="state-card empty-state"><span className="empty-art"><span /><span /><span /></span><span className="eyebrow muted-eyebrow">A BLANK PAGE IS A BEGINNING</span><h3 className="serif">{category === 'all' ? 'The wall is quiet for now.' : `No ${englishCategories[category].toLowerCase()} stories yet.`}</h3><p>Maybe your words are the first ones this corner needs.</p><button onClick={onWrite} className="primary-button" data-testid="button-empty-write">Leave the first story <PenLine size={15} /></button></div>;
}
function Footer() {
  return <footer className="site-footer"><div className="footer-inner"><Brand small /><p>A softer place to be human.</p><span>Made with care, in Malaysia <i>·</i> © 2025 CONFESSIONMIIT</span></div></footer>;
}
function timeAgo(date: string) {
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  if (!Number.isFinite(diff)) return 'just now';
  const minute = 60_000, hour = minute * 60, day = hour * 24;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  return new Date(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/user-portal" /></Show><Show when="signed-out"><HomePage /></Show></>;
}
function UserPortalRoute() {
  return <><Show when="signed-in"><UserPortalPage /></Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}
function SignInPage() {
  return <div className="auth-page"><div className="auth-aside"><Brand /><span className="eyebrow">A PLACE TO SET IT DOWN</span><h1 className="serif">You can be<br /><em>here, quietly.</em></h1><p>Your name stays yours. Your words can still find their people.</p><div className="auth-aside-orbit"><span /><span /><span /></div><span className="auth-aside-caption">CONFESSIONMIIT · A human place</span></div><div className="auth-form-area"><Link href="/" className="auth-back"><ArrowLeft size={15} /> Back to the wall</Link><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></div>;
}
function SignUpPage() {
  return <div className="auth-page"><div className="auth-aside"><Brand /><span className="eyebrow">MAKE ROOM FOR YOURSELF</span><h1 className="serif">No introductions.<br /><em>Just a little care.</em></h1><p>Join a community where your name is never part of the story.</p><div className="auth-aside-orbit"><span /><span /><span /></div><span className="auth-aside-caption">CONFESSIONMIIT · A human place</span></div><div className="auth-form-area"><Link href="/" className="auth-back"><ArrowLeft size={15} /> Back to the wall</Link><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>;
}
function GlobalAnnouncementBanner() {
  const { user } = useUser();
  const [announcements, setAnnouncements] = useState<any[]>([]);

  const loadAnnouncements = () => {
    fetch("/api/moderation/announcements")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAnnouncements(data);
        }
      })
      .catch((err) => console.error("Failed to load announcements", err));
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  if (announcements.length === 0) return null;

  return (
    <div className="bg-red-600 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 py-3 flex flex-col gap-1">
        <div className="flex items-center justify-between font-bold text-sm tracking-wide">
          <div className="flex items-center gap-2">
            <span>🚨</span>
            <span>Emergency System Announcement</span>
          </div>
        </div>
        {announcements.map((item) => (
          <div key={item.id} className="text-sm bg-red-700/50 p-2 rounded flex items-center justify-between">
            <div>
              <span className="font-semibold underline">{item.title}</span>：
              <span>{item.content}</span>
            </div>
            {/* 刪除按鈕：點擊後直接刪除這則公告 */}
            <button
              onClick={async () => {
                const currentEmail = user?.primaryEmailAddress?.emailAddress;
                console.log("【前端】當前準備發送的信箱:", currentEmail); // 點擊刪除時看 F12 Console

                if (!confirm("Are you sure you want to delete this announcement?")) return;
  
                 const res = await fetch(`/api/moderation/announcements/${item.id}`, {
                   method: "DELETE",
                   headers: {
                    "Content-Type": "application/json",
                    "x-user-email": currentEmail || "",
                  },
                });

  if (res.ok) {
    setAnnouncements((prev) => prev.filter((a) => a.id !== item.id));
    toast.success("Announcement deleted successfully.");
  } else {
    toast.error("Deletion failed. Please check if you have administrator privileges.");
  }
}}
              className="ml-4 px-2 py-1 bg-red-800 hover:bg-red-900 text-xs text-white rounded transition"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuthTokenSetter() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
  }, [getToken]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back to the wall', subtitle: 'Come in quietly. Your words stay anonymous.' } },
      signUp: { start: { title: 'Make a little room', subtitle: 'Your account keeps this space safe. Your stories remain anonymous.' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <AuthTokenSetter />
      <ClerkQueryClientCacheInvalidator />
      <PageErrorBoundary>
        <GlobalAnnouncementBanner />
        <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/wall" component={HomePage} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/user-portal" component={UserPortalRoute} />
        <Route path="/moderation" component={ModerationPage} />
        <Route path="/confessions/:id" component={ConfessionPage} />
        <Route component={NotFound} />
      </Switch></PageErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  return <TooltipProvider><WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter></TooltipProvider>;
}

export default App;
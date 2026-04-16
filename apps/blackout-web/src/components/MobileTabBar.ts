export type MobileTab = "home" | "spaces" | "search" | "governance" | "profile";

interface MobileTabBarProps {
  activeTab: MobileTab;
}

const TAB_META: Array<{ id: MobileTab; label: string; icon: string; badge?: string }> = [
  { id: "home", label: "Home", icon: "⌂", badge: "3" },
  { id: "spaces", label: "Canopies", icon: "▦", badge: "12" },
  { id: "search", label: "Search", icon: "⌕" },
  { id: "governance", label: "Gov Hub", icon: "🏛️", badge: "2" },
  { id: "profile", label: "Profile", icon: "◉" },
];

export function renderMobileTabBar({ activeTab }: MobileTabBarProps): string {
  return `
    <nav class="mobile-tabbar" data-testid="mobile-tabbar" aria-label="Mobile tab bar">
      ${TAB_META.map((tab) => {
        const selected = tab.id === activeTab;
        return `
          <button
            type="button"
            class="mobile-tab ${selected ? "is-active" : ""}"
            data-action="mobile-tab"
            data-tab="${tab.id}"
            aria-current="${selected ? "page" : "false"}"
          >
            <span aria-hidden="true">${tab.icon}</span>
            <span>${tab.label}</span>
            ${tab.badge ? `<small>${tab.badge}</small>` : ""}
          </button>
        `;
      }).join("")}
    </nav>
  `;
}

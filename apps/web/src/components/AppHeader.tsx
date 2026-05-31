import { Link } from 'react-router-dom';
import { AppBreadcrumb } from './AppBreadcrumb';
import LogoSVG from './LogoSVG';
import { CommandPalette } from './CommandPalette';
import { HeaderUserMenu } from './header/HeaderUserMenu';
import { HeaderGuidePopovers } from './header/HeaderGuidePopovers';

type AppHeaderProps = {
  uid: number;
  username?: string;
  email?: string;
  role?: string;
  imageUrl?: string;
  study?: boolean;
};

export function AppHeader(props: AppHeaderProps) {
  return (
    <header className="flex items-center gap-4 border-b border-[var(--border-shell-subtle)] bg-[var(--surface-shell-panel)] px-4 py-2.5 text-[var(--text-primary)]">
      <Link
        to="/group"
        aria-label="回到分组首页"
        className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-shell-subtle)] bg-[var(--surface-shell-subtle)] text-[var(--text-primary)] transition hover:border-[var(--border-interactive)] hover:bg-[var(--surface-shell-panel)]"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full">
          <LogoSVG length={28} />
        </div>
      </Link>

      <AppBreadcrumb />

      <div className="flex items-center gap-2.5">
        <CommandPalette />
        <HeaderGuidePopovers />
        <HeaderUserMenu
          uid={props.uid}
          username={props.username}
          email={props.email}
          role={props.role}
          imageUrl={props.imageUrl}
        />
      </div>
    </header>
  );
}

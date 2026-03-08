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
        className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-shell-subtle)] bg-white text-slate-900 transition hover:border-blue-400 hover:bg-blue-400 hover:text-white dark:bg-[var(--surface-shell-subtle)] dark:text-slate-100"
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

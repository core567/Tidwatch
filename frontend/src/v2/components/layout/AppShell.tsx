import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Backdrop } from './Backdrop';
import { SideRail } from './SideRail';
import { TopBar } from './TopBar';

export function AppShell() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="v2-app">
      <Backdrop />
      <SideRail />
      <div className="v2-app__main">
        <TopBar />
        <Outlet />
      </div>
    </div>
  );
}

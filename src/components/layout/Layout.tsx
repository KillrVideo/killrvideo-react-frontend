
import { ReactNode } from 'react';
import Header from './Header';
import DevPanel from '@/components/dev/DevPanel';
import { useDevPanel } from '@/hooks/useDevPanel';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { isDevMode } = useDevPanel();

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <main
          className="overflow-y-auto"
          style={{
            width: isDevMode ? '55%' : '100%',
            transition: 'width 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {children}
        </main>

        {/* Gradient divider */}
        {isDevMode && (
          <div
            className="w-1 shrink-0"
            style={{
              background: 'linear-gradient(to bottom, #FBF8F4, #E85B3A, #0DB7C4, #1A1A2E)',
            }}
          />
        )}

        <div
          className="overflow-hidden"
          style={{
            width: isDevMode ? '45%' : '0%',
            transition: 'width 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <DevPanel />
        </div>
      </div>
    </div>
  );
};

export default Layout;

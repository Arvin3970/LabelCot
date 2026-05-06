import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboardIcon, LibraryIcon, CheckSquareIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Header: React.FC = () => {
  const location = useLocation();
  console.log('Header rendered. Current path:', location.pathname);

  const isActive = (path: string) => location.pathname === path;

  return (
    <header data-cmp="Header" className="border-b border-border sticky top-0 z-50 bg-card/80 backdrop-blur-sm">
      <div className="px-8 h-16 flex items-center justify-between w-full">
        {/* Logo Area */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <CheckSquareIcon className="text-primary-foreground" size={20} />
          </div>
          <span className="text-xl font-bold text-foreground tracking-tight">DataLabel Pro</span>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          <Link to="/">
            <Button variant={isActive('/') ? 'secondary' : 'ghost'} className="flex gap-2">
              <LayoutDashboardIcon size={16} />
              概览看板
            </Button>
          </Link>
          <Link to="/templates">
            <Button variant={isActive('/templates') || isActive('/template-builder') ? 'secondary' : 'ghost'} className="flex gap-2">
              <LibraryIcon size={16} />
              标注模板
            </Button>
          </Link>
          <Link to="/workspace">
            <Button variant={isActive('/workspace') ? 'secondary' : 'ghost'} className="flex gap-2">
              <CheckSquareIcon size={16} />
              工作台
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
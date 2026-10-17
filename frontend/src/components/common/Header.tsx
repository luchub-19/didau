import React from 'react';

export interface HeaderProps {
  onGoHome?: () => void;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ onGoHome, rightAction }) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2.5 focus:outline-none group text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md text-xl group-hover:scale-105 transition-transform">
            🗺️
          </div>
          <div>
            <span className="text-xl font-extrabold text-slate-900 tracking-tight group-hover:text-sky-600 transition-colors">
              Đi Đâu
            </span>
            <span className="hidden sm:inline-block ml-2 text-xs font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-100">
              Planner
            </span>
          </div>
        </button>

        <div className="flex items-center gap-3">{rightAction}</div>
      </div>
    </header>
  );
};

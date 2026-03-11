'use client';

import { Screenshot } from '@clawlive/shared-types';
import { useState } from 'react';
import { format } from 'date-fns';

interface ScreenshotViewerProps {
  screenshots: Screenshot[];
}

export function ScreenshotViewer({ screenshots }: ScreenshotViewerProps) {
  const [selectedIndex, setSelectedIndex] = useState(screenshots.length - 1);

  const currentScreenshot = screenshots[selectedIndex];

  if (!currentScreenshot) return null;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="bg-gray-100 px-4 py-2 border-b flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">🖼️ 浏览器截图</h3>
        <span className="text-xs text-gray-500">
          {selectedIndex + 1} / {screenshots.length}
        </span>
      </div>

      <div className="p-3">
        <img
          src={currentScreenshot.imageUrl}
          alt={currentScreenshot.caption || 'Screenshot'}
          className="w-full rounded border"
        />
        
        {currentScreenshot.caption && (
          <p className="text-sm text-gray-600 mt-2">{currentScreenshot.caption}</p>
        )}
        
        <p className="text-xs text-gray-400 mt-1">
          {format(new Date(currentScreenshot.timestamp), 'HH:mm:ss')}
        </p>

        {screenshots.length > 1 && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
              disabled={selectedIndex === 0}
              className="flex-1 px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← 上一张
            </button>
            <button
              onClick={() => setSelectedIndex(Math.min(screenshots.length - 1, selectedIndex + 1))}
              disabled={selectedIndex === screenshots.length - 1}
              className="flex-1 px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一张 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

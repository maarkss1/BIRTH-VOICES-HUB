import React from 'react';
import { VisualCanvas } from '../../components/studio/Canvas';
import { VersionHistoryPanel } from '../../components/studio/panels/VersionHistoryPanel';

export default function VoiceStudioPage() {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0B0D14]">
      <VisualCanvas />
      <VersionHistoryPanel />
    </div>
  );
}

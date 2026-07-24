"use client";

export default function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      {/* 弹窗 */}
      <div className="fade-in relative z-10 w-full max-w-lg rounded-2xl border border-line bg-panel2 p-6 shadow-panel">
        {title && (
          <div className="mb-4 text-base font-semibold text-ink">{title}</div>
        )}
        {children}
      </div>
    </div>
  );
}

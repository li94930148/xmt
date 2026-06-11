import { useThemeStyles } from '../hooks/useThemeStyles';

interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ isOpen, position, items, onClose }: ContextMenuProps) {
  const styles = useThemeStyles();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[100]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />

      {/* Menu */}
      <div
        className={`fixed z-[101] ${styles.modal} min-w-[180px] py-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100`}
        style={{ left: position.x, top: position.y }}
      >
        {items.map((item, index) => {
          if (item.divider) {
            return <div key={`d-${index}`} className={`my-1 border-t ${styles.divider}`} />;
          }

          return (
            <button
              key={index}
              onClick={() => {
                item.onClick?.();
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150 ${
                item.danger
                  ? `${styles.buttonDanger}`
                  : `${styles.textPrimary} ${styles.hoverBg}`
              }`}
            >
              {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

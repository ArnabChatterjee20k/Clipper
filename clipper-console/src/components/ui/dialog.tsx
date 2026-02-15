import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  showClose?: boolean;
  onClose?: () => void;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;
  return (
    <DialogContext.Provider value={{ onOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

const DialogContext = React.createContext<{ onOpenChange: (open: boolean) => void }>({
  onOpenChange: () => {},
});

function DialogContent({
  title,
  description,
  showClose = true,
  onClose: onCloseProp,
  className,
  children,
  ...props
}: DialogContentProps) {
  const { onOpenChange } = React.useContext(DialogContext);
  const onClose = React.useCallback(() => {
    onCloseProp?.();
    onOpenChange(false);
  }, [onOpenChange, onCloseProp]);

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "relative z-50 w-full max-w-lg max-h-[90vh] overflow-hidden rounded-xl border bg-card shadow-lg px-[25px] py-[17px]",
          className
        )}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {(title || showClose) && (
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              {title && <h2 className="text-lg font-semibold">{title}</h2>}
              {description && (
                <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
              )}
            </div>
            {showClose && (
              <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close">
                <X className="size-4" />
              </Button>
            )}
          </div>
        )}
        <div className="overflow-auto max-h-[calc(90vh-80px)]">{children}</div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(content, document.body)
    : content;
}

export { Dialog, DialogContent };

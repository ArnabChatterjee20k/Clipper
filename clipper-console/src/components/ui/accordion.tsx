import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface AccordionContextValue {
  openIndex: number | null;
  setOpenIndex: (index: number | null) => void;
  type: "single" | "multiple";
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

function useAccordion() {
  const ctx = React.useContext(AccordionContext);
  if (!ctx) throw new Error("Accordion components must be used within Accordion");
  return ctx;
}

interface AccordionProps {
  type?: "single" | "multiple";
  defaultValue?: number | null;
  children: React.ReactNode;
  className?: string;
}

function Accordion({ type = "single", defaultValue = null, children, className }: AccordionProps) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(defaultValue);
  const value = React.useMemo(
    () => ({ openIndex, setOpenIndex, type }),
    [openIndex, type]
  );
  return (
    <AccordionContext.Provider value={value}>
      <div className={cn("flex flex-col gap-1", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  index: number;
  children: React.ReactNode;
  className?: string;
}

function AccordionItem({ index: _index, children, className }: AccordionItemProps) {
  return <div className={cn("rounded-lg border bg-card", className)}>{children}</div>;
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  /** Optional actions (e.g. remove button) shown next to the chevron; click is not propagated to toggle */
  actions?: React.ReactNode;
  className?: string;
}

function AccordionTrigger({ index, children, actions, className }: AccordionTriggerProps & { index: number }) {
  const { openIndex, setOpenIndex } = useAccordion();
  const isOpen = openIndex === index;
  const toggle = () => setOpenIndex(isOpen ? null : index);
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-t-lg px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50",
        className
      )}
      data-state={isOpen ? "open" : "closed"}
      aria-expanded={isOpen}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="flex shrink-0 items-center gap-1">
        {actions && <span onClick={(e) => e.stopPropagation()}>{actions}</span>}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
      </span>
    </button>
  );
}

interface AccordionContentProps {
  children: React.ReactNode;
  index: number;
  className?: string;
}

function AccordionContent({ index, children, className }: AccordionContentProps) {
  const { openIndex } = useAccordion();
  if (openIndex !== index) return null;
  return (
    <div
      className={cn("border-t px-4 py-3", className)}
      data-state={openIndex === index ? "open" : "closed"}
    >
      {children}
    </div>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };

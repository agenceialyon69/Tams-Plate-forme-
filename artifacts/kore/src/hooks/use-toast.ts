export type ToastProps = {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function useToast() {
  return {
    toast: (_props: Partial<ToastProps>) => {},
    dismiss: (_toastId?: string) => {},
    toasts: [] as ToastProps[],
  };
}

export function toast(_props: Partial<ToastProps>) {}

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Campo monetário com máscara R$ #.##0,00 em tempo real.
 * O usuário digita só os números; o valor numérico (em reais) é devolvido
 * via onChange. Ex.: digitar "123456" mostra "R$ 1.234,56" e devolve 1234.56.
 */
export function CurrencyInput({
  value,
  onChange,
  className,
  id,
  invalid,
  placeholder = "R$ 0,00",
  disabled,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  className?: string;
  id?: string;
  invalid?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const display =
    value == null || isNaN(value)
      ? ""
      : "R$ " + value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    onChange(digits ? parseInt(digits, 10) / 100 : 0);
  };

  return (
    <Input
      id={id}
      inputMode="numeric"
      value={display}
      onChange={handle}
      placeholder={placeholder}
      disabled={disabled}
      className={cn("tabular-nums", invalid && "border-destructive ring-2 ring-destructive/40 focus-visible:ring-destructive", className)}
    />
  );
}

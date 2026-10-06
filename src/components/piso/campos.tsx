import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { cn } from "@/lib/utils";

/** Campo que grava ao perder o foco (padrão do módulo Piso). */
export function CampoBlur({
  label,
  value,
  onSave,
  type = "text",
  disabled,
  invalid,
  hint,
  multiline,
  className,
}: {
  label: string;
  value: any;
  onSave: (v: any) => void;
  type?: "text" | "date" | "moeda" | "url" | "number";
  disabled?: boolean;
  invalid?: boolean;
  hint?: string;
  multiline?: boolean;
  className?: string;
}) {
  const [v, setV] = useState<any>(value ?? (type === "moeda" ? null : ""));
  useEffect(() => setV(value ?? (type === "moeda" ? null : "")), [value, type]);
  const commit = (nv: any = v) => {
    const norm = type === "moeda" ? nv : nv === "" ? null : nv;
    if ((norm ?? null) !== (value ?? null)) onSave(norm);
  };
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      {type === "moeda" ? (
        <div onBlur={() => commit()}>
          <CurrencyInput value={v} onChange={setV} disabled={disabled} invalid={invalid} />
        </div>
      ) : multiline ? (
        <Textarea
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => commit()}
          disabled={disabled}
          className={cn(invalid && "border-destructive")}
        />
      ) : (
        <Input
          type={type === "date" ? "date" : type === "number" ? "number" : "text"}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => commit()}
          disabled={disabled}
          className={cn(invalid && "border-destructive")}
        />
      )}
      {hint && (
        <p className={cn("text-[11px]", invalid ? "text-destructive" : "text-muted-foreground")}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Pendencias({ itens }: { itens: string[] }) {
  if (!itens.length)
    return (
      <p className="text-xs text-success font-medium">
        Sem pendências — etapa pronta para conclusão.
      </p>
    );
  return (
    <ul className="text-xs text-destructive space-y-0.5 list-disc pl-4">
      {itens.slice(0, 12).map((x, i) => (
        <li key={i}>{x}</li>
      ))}
      {itens.length > 12 && <li>… e mais {itens.length - 12}</li>}
    </ul>
  );
}

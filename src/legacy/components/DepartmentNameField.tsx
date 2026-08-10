import { useState } from "react";

export function DepartmentNameField({
  id,
  onSave,
}: {
  id: number;
  onSave: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim());
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="mg-unnamed-row">
      <span>Departamento {id}</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do departamento"
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <button onClick={save} disabled={saving || !name.trim()}>
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

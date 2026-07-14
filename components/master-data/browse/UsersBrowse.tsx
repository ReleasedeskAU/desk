"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Mail } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { TopBar } from "@/components/layout/TopBar";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import {
  DEFAULT_PAGE_SIZE,
  pageCount,
  paginateRows,
  type SortDir,
} from "@/lib/master-data/table-utils";
import { useTableFilters } from "@/hooks/useTableFilters";
import { USERS_FILTER_SCHEMA } from "@/lib/table-filters";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import {
  USER_COLUMNS,
  USER_DEFAULT_HIDDEN_COLUMN_KEYS,
  USER_DEFAULT_HIDDEN_FILTER_KEYS,
  USER_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { USER_SORT_PRESETS } from "@/lib/table-sort-presets";
import {
  apiJson,
  BrowseToolbar,
  FormField,
  FormModal,
  inputClass,
  MasterDataEmptyState,
  MasterDataError,
  MasterDataLoading,
  MasterDataTableShell,
  RowActionsMenu,
  SortableTh,
  StatusPill,
  tdClass,
  thClass,
} from "@/components/master-data/shared";

type DepartmentOption = { id: string; name: string };

type UserRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  department: string;
  manager: string | null;
  accessLevel: string;
  status: string;
  lastLogin: string | null;
};

type FormState = {
  name: string;
  email: string;
  role: string;
  department: string;
  manager: string;
  accessLevel: string;
  status: string;
};

const emptyForm: FormState = {
  name: "",
  email: "",
  role: "Developer",
  department: "",
  manager: "",
  accessLevel: "Standard",
  status: "Active",
};

type UserSortKey = "name" | "email" | "role" | "department" | "accessLevel" | "status";

export function UsersBrowse() {
  const { values, setFilter, setSort, clearAll, hasActive, apiQuery } = useTableFilters(USERS_FILTER_SCHEMA);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const search = values.q;
  const page = parseInt(values.page || "1", 10) || 1;
  const sortKey = (values.sort || "name") as UserSortKey;
  const sortDir = (values.sortDir || "asc") as SortDir;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [users, depts] = await Promise.all([
        apiJson<UserRow[]>(`/api/users${apiQuery}`),
        apiJson<DepartmentOption[]>("/api/departments"),
      ]);
      setRows(users);
      setDepartments(depts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [apiQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = pageCount(rows.length, DEFAULT_PAGE_SIZE);
  const pageRows = paginateRows(rows, page, DEFAULT_PAGE_SIZE);

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "users",
    USER_COLUMNS,
    USER_FILTER_FIELDS,
    {
      lockedKeys: ["name", "actions"],
      defaultHiddenFilters: USER_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: USER_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const toggleSort = (key: UserSortKey, dir?: "asc" | "desc") => {
    if (dir) {
      setSort(key, dir);
      return;
    }
    if (sortKey === key) setFilter("sortDir", sortDir === "asc" ? "desc" : "asc");
    else {
      setFilter("sort", key);
      setFilter("sortDir", "asc");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, department: departments[0]?.name ?? "" });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: UserRow) => {
    setEditing(row);
    setForm({
      name: row.name,
      email: row.email,
      role: row.role,
      department: row.department,
      manager: row.manager ?? "",
      accessLevel: row.accessLevel,
      status: row.status,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setFormError("Name and email are required");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        ...form,
        manager: form.manager || null,
      };
      if (editing) {
        await apiJson(`/api/users/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiJson("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: UserRow) => {
    if (!confirm(`Delete user "${row.name}"?`)) return;
    try {
      await apiJson(`/api/users/${row.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <TopBar
          pageKey="users"
          title="Users"
          subtitle={`${rows.length} release stakeholders and approvers`}
          trailing={<PageDocumentation pageKey="users" />}
        />
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 rounded-lg bg-[#2548C9] px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#1E3A9F]"
        >
          Add User
        </button>
      </div>

      {error && <MasterDataError message={error} onRetry={load} />}

      <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
        {isFilterVisible("department") && (
          <FilterSelect value={values.department} onChange={(v) => setFilter("department", v)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </FilterSelect>
        )}
        {isFilterVisible("role") && (
          <FilterSelect value={values.role} onChange={(v) => setFilter("role", v)}>
            <option value="">All roles</option>
            {[...new Set(rows.map((r) => r.role).filter(Boolean))].sort().map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </FilterSelect>
        )}
        {isFilterVisible("accessLevel") && (
          <FilterSelect value={values.accessLevel} onChange={(v) => setFilter("accessLevel", v)}>
            <option value="">All access levels</option>
            {["Standard", "Elevated", "Admin"].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </FilterSelect>
        )}
        {isFilterVisible("status") && (
          <FilterSelect value={values.status} onChange={(v) => setFilter("status", v)}>
            <option value="">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </FilterSelect>
        )}
        {isFilterVisible("nameQ") && (
          <FilterTextInput
            value={values.nameQ}
            onChange={(v) => setFilter("nameQ", v)}
            placeholder="Name…"
          />
        )}
        {isFilterVisible("emailQ") && (
          <FilterTextInput
            value={values.emailQ}
            onChange={(v) => setFilter("emailQ", v)}
            placeholder="Email…"
          />
        )}
        {isFilterVisible("lastLoginQ") && (
          <FilterTextInput
            value={values.lastLoginQ}
            onChange={(v) => setFilter("lastLoginQ", v)}
            placeholder="Last login (YYYY-MM-DD)…"
          />
        )}
      </TableFilterBar>

      <MasterDataTableShell scrollShell toolbar={<TablePageToolbar columnPicker={columnPicker} presets={USER_SORT_PRESETS} sortKey={sortKey} sortDir={sortDir} onSelectSort={setSort} />}>
        <BrowseToolbar
          search={search}
          onSearchChange={(v) => setFilter("q", v)}
          page={page}
          totalPages={totalPages}
          totalRows={rows.length}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={(p) => setFilter("page", String(p))}
        />
        {tablePending ? (
          <MasterDataLoading columns={USER_COLUMNS.length} />
        ) : rows.length === 0 ? (
          <MasterDataEmptyState entityLabel="users" addLabel="Add User" onAdd={openCreate} />
        ) : (
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                {isColumnVisible("name") && (
                  <SortableTh label="Name" active={sortKey === "name"} dir={sortDir} onSort={(dir) => toggleSort("name", dir)} />
                )}
                {isColumnVisible("email") && (
                  <SortableTh label="Email" active={sortKey === "email"} dir={sortDir} onSort={(dir) => toggleSort("email", dir)} />
                )}
                {isColumnVisible("role") && (
                  <SortableTh label="Role" active={sortKey === "role"} dir={sortDir} onSort={(dir) => toggleSort("role", dir)} />
                )}
                {isColumnVisible("department") && (
                  <SortableTh label="Department" active={sortKey === "department"} dir={sortDir} onSort={(dir) => toggleSort("department", dir)} />
                )}
                {isColumnVisible("accessLevel") && (
                  <SortableTh label="Access Level" active={sortKey === "accessLevel"} dir={sortDir} onSort={(dir) => toggleSort("accessLevel", dir)} />
                )}
                {isColumnVisible("status") && (
                  <SortableTh label="Status" active={sortKey === "status"} dir={sortDir} onSort={(dir) => toggleSort("status", dir)} />
                )}
                {isColumnVisible("lastLogin") && <th className={thClass}>Last Login</th>}
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-200">
                  {isColumnVisible("name") && (
                  <td className={tdClass}>
                    <div className="flex items-center gap-3">
                      <Avatar name={row.name} size="sm" />
                      <span className="font-semibold text-gray-900">{row.name}</span>
                    </div>
                  </td>
                  )}
                  {isColumnVisible("email") && (
                  <td className={tdClass}>
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <Mail className="h-3 w-3 shrink-0" /> {row.email}
                    </span>
                  </td>
                  )}
                  {isColumnVisible("role") && (
                  <td className={tdClass}>
                    <StatusPill value={row.role} />
                  </td>
                  )}
                  {isColumnVisible("department") && <td className={tdClass}>{row.department}</td>}
                  {isColumnVisible("accessLevel") && <td className={tdClass}>{row.accessLevel}</td>}
                  {isColumnVisible("status") && (
                  <td className={tdClass}>
                    <StatusPill value={row.status} />
                  </td>
                  )}
                  {isColumnVisible("lastLogin") && (
                  <td className={`${tdClass} text-gray-500`}>
                    {row.lastLogin ? formatDate(row.lastLogin) : "—"}
                  </td>
                  )}
                  <td className={`${tdClass} text-right`}>
                    <RowActionsMenu onEdit={() => openEdit(row)} onDelete={() => handleDelete(row)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </MasterDataTableShell>

      <FormModal
        open={modalOpen}
        title={editing ? "Edit User" : "Add User"}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        submitting={submitting}
      >
        {formError && <p className="text-[13px] text-red-600">{formError}</p>}
        <FormField label="Name" required>
          <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </FormField>
        <FormField label="Email" required>
          <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </FormField>
        <FormField label="Role">
          <input className={inputClass} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
        </FormField>
        <FormField label="Department">
          <select className={inputClass} value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}>
            <option value="">Select department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Manager">
          <input className={inputClass} value={form.manager} onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))} />
        </FormField>
        <FormField label="Access Level">
          <select className={inputClass} value={form.accessLevel} onChange={(e) => setForm((f) => ({ ...f, accessLevel: e.target.value }))}>
            <option value="Standard">Standard</option>
            <option value="Elevated">Elevated</option>
            <option value="Admin">Admin</option>
          </select>
        </FormField>
        <FormField label="Status">
          <select className={inputClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </FormField>
      </FormModal>
    </div>
  );
}

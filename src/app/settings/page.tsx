import { prisma } from "@/lib/db";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import {
  updateOrganizationAction,
  saveUserAction,
  deleteUserAction,
} from "@/app/actions";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/constants";

export default async function SettingsPage() {
  const [org, users] = await Promise.all([
    prisma.organization.findFirst(),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-gray-500">
          Organization profile and user accounts.
        </p>
      </div>

      {/* Organization */}
      <section className="card space-y-5 p-6">
        <div>
          <h2 className="text-lg font-semibold">Organization</h2>
          <p className="text-sm text-gray-500">
            These values fill{" "}
            <code className="rounded bg-gray-100 px-1 text-xs">
              {"{{ org.* }}"}
            </code>{" "}
            merge fields during document generation.
          </p>
        </div>

        <form action={updateOrganizationAction} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Name</label>
              <input
                name="name"
                className="input"
                defaultValue={org?.name ?? ""}
                placeholder="Acme"
              />
            </div>
            <div>
              <label className="label">Legal name</label>
              <input
                name="legalName"
                className="input"
                defaultValue={org?.legalName ?? ""}
                placeholder="Acme, Inc."
              />
            </div>
          </div>

          <div>
            <label className="label">Address</label>
            <textarea
              name="address"
              rows={3}
              className="input"
              defaultValue={org?.address ?? ""}
              placeholder="1 Main St, Metropolis"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input
                name="email"
                type="email"
                className="input"
                defaultValue={org?.email ?? ""}
                placeholder="legal@acme.com"
              />
            </div>
            <div>
              <label className="label">Jurisdiction</label>
              <input
                name="jurisdiction"
                className="input"
                defaultValue={org?.jurisdiction ?? ""}
                placeholder="Delaware"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Signatory name</label>
              <input
                name="signatoryName"
                className="input"
                defaultValue={org?.signatoryName ?? ""}
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="label">Signatory title</label>
              <input
                name="signatoryTitle"
                className="input"
                defaultValue={org?.signatoryTitle ?? ""}
                placeholder="Chief Executive Officer"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="btn-primary">
              Save organization
            </button>
          </div>
        </form>
      </section>

      {/* Users */}
      <section className="card space-y-5 p-6">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-gray-500">
            People who can own contracts and act on workflow steps.
          </p>
        </div>

        {users.length === 0 ? (
          <p className="text-sm text-gray-500">No users yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {ROLE_LABELS[u.role as Role] ?? u.role}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.title ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteUserAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <ConfirmSubmit
                          message="Delete this user?"
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Delete
                        </ConfirmSubmit>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold">Add user</h3>
          <form action={saveUserAction} className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Name</label>
                <input name="name" className="input" placeholder="Jane Doe" />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  name="email"
                  type="email"
                  className="input"
                  placeholder="jane@acme.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Role</label>
                <select name="role" className="input" defaultValue={ROLES[0]}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Title</label>
                <input
                  name="title"
                  className="input"
                  placeholder="General Counsel"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary">
                Add user
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

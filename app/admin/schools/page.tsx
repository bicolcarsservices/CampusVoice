import AdminActionForm from "@/components/admin/AdminActionForm";
import { createClient } from "@/lib/supabase/server";
import { publicStorageUrl } from "@/lib/branding";
import { saveSchool } from "@/server/admin-actions";

export default async function AdminSchoolsPage() {
  const supabase = createClient();
  const { data: schools, error } = await supabase.from("schools")
    .select("id,name,location,description,logo_path,is_active").order("name");
  if (error) throw new Error(`Could not load schools: ${error.message}`);
  return (
    <section className="space-y-5">
      <div><h2 className="text-2xl font-bold">School management</h2><p className="text-sm text-slate-500">Deactivate a school to hide it from signup and public directories. Existing posts retain their school association.</p></div>
      <article className="card">
        <h3 className="mb-3 text-lg font-bold">Add school</h3>
        <AdminActionForm action={saveSchool} submitLabel="Add school">
          <label className="block text-sm">School name<input name="name" required maxLength={120} className="input mt-1" /></label>
          <label className="block text-sm">Location<input name="location" maxLength={120} className="input mt-1" /></label>
          <label className="block text-sm">Description<textarea name="description" maxLength={1000} className="input mt-1" /></label>
          <label className="block text-sm">School logo<input name="logo" type="file" accept="image/jpeg,image/png,image/webp" className="input mt-1" /></label>
          <input type="hidden" name="is_active" value="true" />
        </AdminActionForm>
      </article>
      {(schools ?? []).map((school) => (
        <article key={school.id} className="card">
          <div className="mb-4 flex items-center gap-3">
            {school.logo_path
              ? <img src={publicStorageUrl(supabase, "school-logos", school.logo_path) ?? ""} alt={`${school.name} logo`} className="h-14 w-14 rounded-xl bg-slate-100 object-contain p-1 dark:bg-slate-800" />
              : <div className="grid h-14 w-14 place-items-center rounded-xl bg-slate-100 text-xl text-slate-400 dark:bg-slate-800">+</div>}
            <div><h3 className="font-bold">{school.name}</h3><p className="text-xs text-slate-500">Current school logo</p></div>
          </div>
          <AdminActionForm action={saveSchool} submitLabel="Save school">
            <input type="hidden" name="id" value={school.id} />
            <label className="block text-sm">School name<input name="name" required maxLength={120} defaultValue={school.name} className="input mt-1" /></label>
            <label className="block text-sm">Location<input name="location" maxLength={120} defaultValue={school.location ?? ""} className="input mt-1" /></label>
            <label className="block text-sm">Description<textarea name="description" maxLength={1000} defaultValue={school.description ?? ""} className="input mt-1" /></label>
            <label className="block text-sm">Replace school logo<input name="logo" type="file" accept="image/jpeg,image/png,image/webp" className="input mt-1" /></label>
            <label className="block text-sm">Status<select name="is_active" defaultValue={String(school.is_active)} className="input mt-1"><option value="true">Active</option><option value="false">Inactive</option></select></label>
          </AdminActionForm>
        </article>
      ))}
    </section>
  );
}

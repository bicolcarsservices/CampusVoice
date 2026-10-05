import AdminActionForm from "@/components/admin/AdminActionForm";
import { createClient } from "@/lib/supabase/server";
import { saveCategory } from "@/server/admin-actions";

export default async function AdminCategoriesPage() {
  const { data: categories, error } = await createClient().from("categories")
    .select("id,name,sort_order,is_active").order("sort_order");
  if (error) throw new Error(`Could not load categories: ${error.message}`);
  return (
    <section className="space-y-5">
      <div><h2 className="text-2xl font-bold">Category management</h2><p className="text-sm text-slate-500">Inactive categories are hidden from new posts and feed filters.</p></div>
      <article className="card">
        <h3 className="mb-3 text-lg font-bold">Add category</h3>
        <AdminActionForm action={saveCategory} submitLabel="Add category">
          <label className="block text-sm">Name<input name="name" required maxLength={80} className="input mt-1" /></label>
          <label className="block text-sm">Sort order<input name="sort_order" type="number" min="0" defaultValue="99" className="input mt-1" /></label>
          <input type="hidden" name="is_active" value="true" />
        </AdminActionForm>
      </article>
      {(categories ?? []).map((category) => (
        <article className="card" key={category.id}>
          <AdminActionForm action={saveCategory} submitLabel="Save category">
            <input type="hidden" name="id" value={category.id} />
            <label className="block text-sm">Name<input name="name" required maxLength={80} defaultValue={category.name} className="input mt-1" /></label>
            <label className="block text-sm">Sort order<input name="sort_order" type="number" min="0" defaultValue={category.sort_order} className="input mt-1" /></label>
            <label className="block text-sm">Status<select name="is_active" defaultValue={String(category.is_active)} className="input mt-1"><option value="true">Active</option><option value="false">Inactive</option></select></label>
          </AdminActionForm>
        </article>
      ))}
    </section>
  );
}

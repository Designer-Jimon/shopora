'use client';

// SHOPORA product form — shared between Add and Edit flows.
// Handles basic fields, pricing, category, SEO, variants, and image upload.

import { useState, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Category = { id: string; name: string; slug: string };

type Variant = {
  id?: string;
  sku: string;
  color: string;
  size: string;
  weight: string;
  priceOverride: string;
  stockQuantity: string;
};

type ProductFormData = {
  name: string;
  description: string;
  brand: string;
  sku: string;
  price: string;
  discountPrice: string;
  status: string;
  stockQuantity: string;
  categoryId: string;
  seoTitle: string;
  seoDescription: string;
  variants: Variant[];
};

type ProductFormProps = {
  categories: Category[];
  initialData?: {
    id: string;
    name: string;
    description: string | null;
    brand: string | null;
    sku: string | null;
    price: number;
    discountPrice: number | null;
    status: string;
    stockQuantity: number;
    categoryId: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    images: { id: string; url: string; position: number }[];
    variants: { id: string; sku: string | null; color: string | null; size: string | null; weight: number | null; priceOverride: number | null; stockQuantity: number }[];
  };
  isEdit?: boolean;
};

function emptyVariant(): Variant {
  return { sku: '', color: '', size: '', weight: '', priceOverride: '', stockQuantity: '0' };
}

function Input({ label, name, value, onChange, type = 'text', required = false, placeholder, step, min }: {
  label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; required?: boolean; placeholder?: string; step?: string; min?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-[var(--color-text)]">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input id={name} name={name} type={type} value={value} onChange={onChange} required={required} placeholder={placeholder} step={step} min={min}
        className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
    </div>
  );
}

function Textarea({ label, name, value, onChange, placeholder }: {
  label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-[var(--color-text)]">{label}</label>
      <textarea id={name} name={name} value={value} onChange={onChange} rows={3} placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
    </div>
  );
}

export default function ProductForm({ categories, initialData, isEdit = false }: ProductFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<{ id?: string; url: string }[]>(initialData?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ProductFormData>({
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
    brand: initialData?.brand ?? '',
    sku: initialData?.sku ?? '',
    price: initialData?.price?.toString() ?? '',
    discountPrice: initialData?.discountPrice?.toString() ?? '',
    status: initialData?.status ?? 'draft',
    stockQuantity: initialData?.stockQuantity?.toString() ?? '',
    categoryId: initialData?.categoryId ?? '',
    seoTitle: initialData?.seoTitle ?? '',
    seoDescription: initialData?.seoDescription ?? '',
    variants: initialData?.variants?.map((v) => ({
      id: v.id,
      sku: v.sku ?? '',
      color: v.color ?? '',
      size: v.size ?? '',
      weight: v.weight?.toString() ?? '',
      priceOverride: v.priceOverride?.toString() ?? '',
      stockQuantity: v.stockQuantity?.toString() ?? '0',
    })) ?? [],
  });

  const update = (field: keyof ProductFormData, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const updateVariant = (idx: number, field: keyof Variant, value: string) => {
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, i) => (i === idx ? { ...v, [field]: value } : v)),
    }));
  };

  const addVariant = () => setForm((f) => ({ ...f, variants: [...f.variants, emptyVariant()] }));
  const removeVariant = (idx: number) => setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== idx) }));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/uploads/product', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.url) {
        setImageUrls((prev) => [...prev, { url: data.url }]);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      ...form,
      price: parseFloat(form.price) || 0,
      discountPrice: form.discountPrice ? parseFloat(form.discountPrice) : null,
      stockQuantity: parseInt(form.stockQuantity, 10) || 0,
      categoryId: form.categoryId || null,
      imageUrls: imageUrls.map((img) => img.url),
      variants: form.variants.filter((v) => v.color || v.size || v.sku).map((v) => ({
        ...v,
        weight: v.weight ? parseFloat(v.weight) : null,
        priceOverride: v.priceOverride ? parseFloat(v.priceOverride) : null,
        stockQuantity: parseInt(v.stockQuantity, 10) || 0,
      })),
    };

    try {
      const url = isEdit ? `/api/products/${initialData?.id}` : '/api/products';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save product');
        return;
      }

      router.push('/products/all');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Basic information</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Product name" name="name" value={form.name} onChange={(e) => update('name', e.target.value)} required placeholder="e.g. Ankara Wax Print" />
          </div>
          <Textarea label="Description" name="description" value={form.description} onChange={(e) => update('description', e.target.value)} />
          <Input label="Brand" name="brand" value={form.brand} onChange={(e) => update('brand', e.target.value)} placeholder="e.g. Vlisco" />
          <Input label="SKU" name="sku" value={form.sku} onChange={(e) => update('sku', e.target.value)} placeholder="e.g. ANK-001" />
          <div>
            <label htmlFor="categoryId" className="block text-sm font-medium text-[var(--color-text)]">Category</label>
            <select id="categoryId" value={form.categoryId} onChange={(e) => update('categoryId', e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none">
              <option value="">No category</option>
              {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Pricing &amp; status</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Price (NGN)" name="price" value={form.price} onChange={(e) => update('price', e.target.value)} type="number" step="0.01" min="0" required />
          <Input label="Discount price (optional)" name="discountPrice" value={form.discountPrice} onChange={(e) => update('discountPrice', e.target.value)} type="number" step="0.01" min="0" />
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-[var(--color-text)]">Status</label>
            <select id="status" value={form.status} onChange={(e) => update('status', e.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <Input label="Stock quantity" name="stockQuantity" value={form.stockQuantity} onChange={(e) => update('stockQuantity', e.target.value)} type="number" min="0" placeholder="0" />
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Variants</h2>
          <button type="button" onClick={addVariant} className="text-xs font-medium text-[var(--color-primary)] hover:underline">+ Add variant</button>
        </div>
        {form.variants.length === 0 && (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">No variants — this product uses the base stock and price.</p>
        )}
        <div className="mt-4 space-y-4">
          {form.variants.map((v, idx) => (
            <div key={idx} className="grid gap-3 rounded-md border border-[var(--color-border)] p-3 sm:grid-cols-6">
              <Input label="SKU" name={`v_sku_${idx}`} value={v.sku} onChange={(e) => updateVariant(idx, 'sku', e.target.value)} placeholder="SKU" />
              <Input label="Color" name={`v_color_${idx}`} value={v.color} onChange={(e) => updateVariant(idx, 'color', e.target.value)} placeholder="e.g. Red" />
              <Input label="Size" name={`v_size_${idx}`} value={v.size} onChange={(e) => updateVariant(idx, 'size', e.target.value)} placeholder="e.g. XL" />
              <Input label="Weight (g)" name={`v_weight_${idx}`} value={v.weight} onChange={(e) => updateVariant(idx, 'weight', e.target.value)} type="number" step="0.01" />
              <Input label="Price override" name={`v_price_${idx}`} value={v.priceOverride} onChange={(e) => updateVariant(idx, 'priceOverride', e.target.value)} type="number" step="0.01" />
              <div className="flex items-end gap-1">
                <Input label="Stock" name={`v_stock_${idx}`} value={v.stockQuantity} onChange={(e) => updateVariant(idx, 'stockQuantity', e.target.value)} type="number" min="0" />
                <button type="button" onClick={() => removeVariant(idx)} className="mb-1 h-9 w-9 shrink-0 rounded-md border border-red-200 text-red-500 hover:bg-red-50" title="Remove variant">✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Images</h2>
        <div className="mt-4 flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.svg" onChange={handleUpload} className="hidden" id="product-image-input" />
          <label htmlFor="product-image-input" className="cursor-pointer rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-primary-50)]">
            {uploading ? 'Uploading…' : 'Upload image'}
          </label>
          <span className="text-xs text-[var(--color-text-muted)]">PNG, JPG, WEBP, GIF, SVG up to 5 MB</span>
        </div>
        {imageUrls.length > 0 && (
          <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
            {imageUrls.map((img, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-md border border-[var(--color-border)]">
                <img src={img.url} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">SEO</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label="SEO title" name="seoTitle" value={form.seoTitle} onChange={(e) => update('seoTitle', e.target.value)} placeholder="Defaults to product name" />
          <div className="sm:col-span-2">
            <Textarea label="SEO description" name="seoDescription" value={form.seoDescription} onChange={(e) => update('seoDescription', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Update product' : 'Create product'}
        </button>
      </div>
    </form>
  );
}

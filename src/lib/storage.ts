import { supabase } from "@/integrations/supabase/client";

/**
 * Uploads a product image to the `product-images` storage bucket.
 * Returns the storage path of the uploaded file.
 */
export async function uploadProductImage(file: File): Promise<string> {
  const fileExt = file.name.split(".").pop();
  const uniqueId = Math.random().toString(36).substring(2, 15);
  const fileName = `${uniqueId}-${Date.now()}.${fileExt}`;
  const filePath = `product_images/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  return filePath;
}

/**
 * Deletes a product image from the `product-images` storage bucket given its storage path/url.
 */
export async function deleteProductImage(pathOrUrl: string): Promise<void> {
  if (!pathOrUrl) return;

  // Extract the path if a full URL was passed in
  let path = pathOrUrl;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    const match = pathOrUrl.match(/\/product-images\/(.+?)(?:\?|$)/);
    if (match && match[1]) {
      path = decodeURIComponent(match[1]);
    } else {
      // If it is an external URL, we don't delete it
      return;
    }
  }

  try {
    const { error } = await supabase.storage
      .from("product-images")
      .remove([path]);

    if (error) {
      console.error("Failed to delete image from storage:", path, error.message);
    }
  } catch (err) {
    console.error("Failed to delete old image from storage", err);
  }
}

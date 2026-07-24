import { useState, useEffect } from "react";
import { Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface ProductImageProps {
  url?: string | null;
  name: string;
  className?: string;
  fallback?: React.ReactNode;
  onClick?: () => void;
  objectFit?: "cover" | "contain";
}

export function ProductImage({ url, name, className = "", fallback, onClick, objectFit = "cover" }: ProductImageProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) {
      setImgSrc(null);
      setLoading(false);
      setError(false);
      return;
    }

    if (url.startsWith("http://") || url.startsWith("https://")) {
      setImgSrc(url);
      setLoading(true);
      setError(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(false);

    async function getSignedUrl() {
      try {
        const { data, error: signError } = await supabase.storage
          .from("product-images")
          .createSignedUrl(url, 3600); // 1 hour expiration
        
        if (signError) throw signError;
        if (active && data) {
          setImgSrc(data.signedUrl);
        }
      } catch (err) {
        console.error("Error generating signed URL for image:", url, err);
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    }

    getSignedUrl();
    return () => {
      active = false;
    };
  }, [url]);

  if (!url || error) {
    return <>{fallback}</>;
  }

  return (
    <div
      onClick={!loading ? onClick : undefined}
      className={`relative shrink-0 overflow-hidden ${className} ${onClick && !loading ? "cursor-pointer" : ""}`}
    >
      {loading && <Skeleton className="absolute inset-0 rounded-lg w-full h-full" />}
      {imgSrc && (
        <img
          src={imgSrc}
          alt={name}
          loading="lazy"
          className={`w-full h-full ${
            objectFit === "contain" ? "object-contain" : "object-cover"
          } rounded-lg transition-opacity duration-200 ${
            loading ? "opacity-0" : "opacity-100"
          }`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
        />
      )}
    </div>
  );
}

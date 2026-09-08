import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Camera, Trash, Image as ImageIcon, Plus } from "lucide-react";
import { toast } from "sonner";

interface PhotosCardProps {
  photos: any[];
  onChange: (updatedPhotos: any[]) => void;
}

const PHOTO_CATEGORIES = [
  "Before Service",
  "After Service",
  "Defect Photos",
  "Calibration Display",
  "Name Plate",
  "Additional Photos"
];

export function PhotosCard({ photos, onChange }: PhotosCardProps) {
  const [category, setCategory] = useState("Before Service");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPhotos = [...photos];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Create local object URL for preview
      const previewUrl = URL.createObjectURL(file);
      newPhotos.push({
        category: category,
        photo_url: previewUrl,
        photo_name: file.name,
      });
    }
    onChange(newPhotos);
    toast.success("Image added to report attachments.");
  };

  const handleRemovePhoto = (index: number) => {
    const updated = photos.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  return (
    <Card className="bg-slate-900 border-slate-800 text-white shadow-xl max-w-full">
      <CardHeader>
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-400">
          Step 7: Attachments & Service Photos
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Upload photo references. Supports mobile camera captures.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Upload Controls */}
        <div className="grid gap-3 sm:grid-cols-2 bg-slate-950/40 p-4 border border-slate-850 rounded-xl">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-300">Photo Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-slate-900 border-slate-800 text-white min-h-10 text-xs">
                <SelectValue placeholder="Select image classification" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white">
                {PHOTO_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col justify-end">
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment" // triggers camera on mobile devices
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 w-full flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> Snap / Upload Image
            </Button>
          </div>
        </div>

        {/* Previews grid */}
        {photos.length > 0 ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            {photos.map((p, idx) => (
              <div
                key={idx}
                className="group relative border border-slate-800 rounded-lg overflow-hidden bg-slate-950 aspect-video flex flex-col justify-end p-2"
              >
                <img
                  src={p.photo_url}
                  alt={p.photo_name || p.category}
                  className="absolute inset-0 w-full h-full object-cover opacity-80"
                />
                
                {/* Delete overlay */}
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemovePhoto(idx)}
                    className="bg-red-600 hover:bg-red-750 text-white h-8 w-8 rounded-full"
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                </div>

                <div className="relative z-10 text-[9px] font-bold text-white bg-slate-950/80 px-2 py-0.5 rounded truncate max-w-full">
                  {p.category}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
            <ImageIcon className="w-8 h-8 opacity-25" />
            No photos uploaded yet. Select category and snap references.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

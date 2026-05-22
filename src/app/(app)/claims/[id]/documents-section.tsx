"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
  registerClaimDocument,
  getDocumentSignedUrl,
} from "@/lib/actions/claims";

interface DocRow {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export function ClaimDocumentsSection({
  claimId,
  familyUnitId,
  documents,
  canUpload,
}: {
  claimId: string;
  familyUnitId: string;
  documents: DocRow[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same file
    if (!file) return;

    setError(null);

    // Client-side validation (server + storage policies enforce again)
    if (!ALLOWED_MIME.includes(file.type)) {
      setError("Please upload a JPEG, PNG, WebP, or PDF file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File is too large. Maximum size is 10 MB.");
      return;
    }

    setUploading(true);
    setProgress(`Uploading ${file.name}…`);

    try {
      // Build the path: {family_unit_id}/{claim_id}/{timestamp}-{name}
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${familyUnitId}/${claimId}/${Date.now()}-${safeName}`;

      // Direct upload using the user's own Supabase client. RLS on storage
      // verifies the path's first segment matches the user's family_unit_id.
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("claim-documents")
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        setUploading(false);
        setProgress(null);
        return;
      }

      // Register the document in the DB (server action)
      const result = await registerClaimDocument({
        claim_id: claimId,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });

      if (!result.ok) {
        // Try to clean up the orphaned object
        await supabase.storage.from("claim-documents").remove([storagePath]);
        setError(result.error);
        setUploading(false);
        setProgress(null);
        return;
      }

      setProgress(null);
      setUploading(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error during upload.");
      setUploading(false);
      setProgress(null);
    }
  }

  async function handleDownload(docId: string) {
    setDownloadingId(docId);
    setError(null);
    const result = await getDocumentSignedUrl(docId);
    setDownloadingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Open in a new tab — browser will trigger download for non-inline mime types
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supporting documents</CardTitle>
        <CardDescription>
          Upload the bill or receipt. JPEG, PNG, WebP, or PDF — up to 10 MB.
        </CardDescription>
      </CardHeader>

      {documents.length === 0 ? (
        <p className="text-sm text-[var(--color-text-subtle)] py-3">
          No documents attached yet.
        </p>
      ) : (
        <ul className="space-y-2 mb-4">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 p-3 rounded-md border border-[var(--color-border)]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {doc.file_name}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {(doc.size_bytes / 1024).toFixed(0)} KB
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(doc.id)}
                disabled={downloadingId === doc.id}
              >
                {downloadingId === doc.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <div>
          <label
            className={`inline-flex items-center gap-2 px-4 h-10 rounded-md border border-[var(--color-border-strong)] bg-white text-sm font-medium cursor-pointer hover:bg-[var(--color-surface-2)] ${
              uploading ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <span>{uploading ? "Uploading…" : "Add a document"}</span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      )}

      {progress && (
        <p className="text-xs text-[var(--color-text-muted)] mt-2">{progress}</p>
      )}
      {error && (
        <p
          role="alert"
          className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-soft)] rounded-md px-3 py-2 mt-3"
        >
          {error}
        </p>
      )}
    </Card>
  );
}

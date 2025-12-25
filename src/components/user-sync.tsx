"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/lib/auth/compat-client";

export function UserSync() {
  const { user, isLoaded } = useUser();
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    // ถ้า Clerk ยังไม่โหลด, ยังไม่มี user หรือ sync ไปแล้ว → ไม่ต้องทำอะไร
    if (!isLoaded || !user || synced) return;

    let cancelled = false;

    const syncUser = async () => {
      try {
        const response = await fetch("/api/sync-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (cancelled) return;

        if (response.ok) {
          console.log("✅ User synced with database");
          setSynced(true);
        } else {
          // log text เผื่อ debug 500 ได้ละเอียดขึ้น
          const text = await response.text().catch(() => "");
          console.error(
            "❌ Failed to sync user",
            response.status,
            response.statusText,
            text
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error("❌ Sync error:", error);
        }
      }
    };

    syncUser();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user, synced]);

  // component นี้ไม่ต้อง render อะไร
  return null;
}

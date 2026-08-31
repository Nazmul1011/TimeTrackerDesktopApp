/**
 * Notification panel — reused empty-state card (full page still uses list).
 */
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function NotificationPanel() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="py-8 text-center text-sm text-muted-foreground">No notifications</p>
      </CardContent>
    </Card>
  );
}

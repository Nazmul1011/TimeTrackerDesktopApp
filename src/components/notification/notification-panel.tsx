/**
 * Notification panel — empty shell.
 */
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export function NotificationPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px]">
          <p className="py-8 text-center text-sm text-muted-foreground">No notifications</p>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

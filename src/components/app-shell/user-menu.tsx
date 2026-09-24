"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Role, ROLES } from "@/domain/permissions";
import { setPreviewRole } from "@/server/preview-role";

/**
 * Placeholder user until sign-in exists (Better Auth, after the screens). On sample data
 * it also offers "View as": the app re-renders with that role's permissions.
 */
export function UserMenu({ role, canPreview }: { role: Role; canPreview: boolean }) {
  const t = useTranslations("topbar");
  const tRoles = useTranslations("roles");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function preview(next: string) {
    if (next === role) return;
    startTransition(async () => {
      await setPreviewRole(next);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="rounded-full" aria-label={t("userMenu")} />}
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-secondary text-xs font-bold text-secondary-foreground">UE</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60" aria-busy={pending}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block font-semibold text-foreground">{t("sampleUser")}</span>
            <span className="block text-xs font-normal" data-testid="current-role">
              {tRoles(role)}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {canPreview ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <span className="block font-semibold text-foreground">{t("previewAs")}</span>
                <span className="block max-w-56 text-xs font-normal">{t("previewHint")}</span>
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={role} onValueChange={(value) => preview(String(value))}>
                {ROLES.map((r) => (
                  <DropdownMenuRadioItem key={r} value={r} disabled={pending}>
                    {tRoles(r)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled title={t("signOutSoon")}>
          <LogOut aria-hidden />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

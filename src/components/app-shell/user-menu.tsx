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
import { setPreviewRole, setPreviewUser } from "@/server/preview-role";

/**
 * Placeholder user until sign-in exists (Better Auth, after the screens). On sample data
 * it also offers "View as": the app re-renders with that role's permissions.
 */
export function UserMenu({
  role,
  user,
  people,
  canPreview,
}: {
  role: Role;
  user: { id: string; name: string };
  people: { id: string; name: string }[];
  canPreview: boolean;
}) {
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

  function previewPerson(next: string) {
    if (next === user.id) return;
    startTransition(async () => {
      await setPreviewUser(next);
      router.refresh();
    });
  }

  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="rounded-full" aria-label={t("userMenu")} />}
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-secondary text-xs font-bold text-secondary-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60" aria-busy={pending}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block font-semibold text-foreground">{user.name}</span>
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
              <DropdownMenuLabel className="pt-2 text-xs font-medium">{t("previewPerson")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={user.id} onValueChange={(value) => previewPerson(String(value))}>
                {people.map((p) => (
                  <DropdownMenuRadioItem key={p.id} value={p.id} disabled={pending}>
                    {p.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuLabel className="pt-2 text-xs font-medium">{t("previewRole")}</DropdownMenuLabel>
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

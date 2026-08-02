/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import {
  Edit3,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { User } from "@/types";
import { adminApi } from "@/lib/axios";
import { Console, formatDateTime } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";

type CustomerDetailsDrawerProps = {
  user: User | null;
  isOnline: boolean;
  conversationStatus?: string;
  messageCount: number;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (user: User) => void;
  onExportAllConversations: () => void;
  onDeleteAllConversations: () => void;
  onDeleteUser: () => void;
  canDeleteHistory: boolean;
};

const getDisplayName = (user: User) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ") || "Visitor";

const getWhatsAppUrl = (phone?: string) => {
  const number = phone?.replace(/\D/g, "");
  return number ? `https://wa.me/${number}` : undefined;
};

export function CustomerDetailsDrawer({
  user,
  isOnline,
  conversationStatus,
  messageCount,
  isOpen,
  onClose,
  onUpdate,
  onExportAllConversations,
  onDeleteAllConversations,
  onDeleteUser,
  canDeleteHistory,
}: CustomerDetailsDrawerProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<Partial<User>>({});

  useEffect(() => {
    if (isOpen && user) {
      setForm(user);
      setIsEditing(false);
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const startEditing = () => {
    setForm(user);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setForm(user);
    setIsEditing(false);
  };

  const updateField = (field: keyof User, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const save = async () => {
    const requiredFields = [
      form.firstName,
      form.lastName,
      form.email,
      form.phone,
      form.country,
    ];
    if (requiredFields.some((value) => !value?.trim())) {
      toast({
        title: "Complete the profile",
        description: "Name, email, phone and country are required.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await adminApi.put(`/admin/users/${user.id}`, form);
      onUpdate(response.data);
      setForm(response.data);
      setIsEditing(false);
      toast({ title: "Profile updated", description: "Visitor details were saved." });
    } catch (error) {
      Console.error("Unable to update visitor profile", error);
      toast({
        title: "Unable to save profile",
        description: "Please check the details and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const contactFields: Array<[keyof User, string, "email" | "text"]> = [
    ["firstName", "First name", "text"],
    ["lastName", "Last name", "text"],
    ["email", "Email address", "email"],
    ["phone", "Phone number", "text"],
    ["country", "Country", "text"],
  ];
  const whatsAppUrl = getWhatsAppUrl(user.phone);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Customer details">
      <button className="absolute inset-0 cursor-default bg-slate-950/30" onClick={onClose} aria-label="Close customer details" />
      <aside className="absolute bottom-0 right-0 top-0 flex w-[21rem] max-w-[92vw] flex-col bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="font-semibold">Customer details</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close customer details"><X size={18} /></button>
        </div>

        <div className="space-y-6 overflow-y-auto p-5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src={`https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${user.id}`} alt="" className="h-14 w-14 rounded-full bg-slate-100" />
              <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${isOnline ? "bg-emerald-500" : "bg-slate-400"}`} />
            </div>
            <div className="min-w-0"><p className="truncate font-semibold">{getDisplayName(user)}</p><p className="text-xs text-slate-500">{isOnline ? "Online now" : "Offline"}</p></div>
            <button onClick={isEditing ? cancelEditing : startEditing} className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" aria-label={isEditing ? "Stop editing profile" : "Edit profile"}><Edit3 size={17} /></button>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Contact details</h3>{isEditing && <span className="text-[11px] text-slate-400">All fields required</span>}</div>
            <div className="space-y-3">
              {contactFields.map(([field, label, type]) => (
                <label key={field} className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}
                  {isEditing ? <input value={(form[field] as string) || ""} onChange={(event) => updateField(field, event.target.value)} type={type} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white" /> : field === "email" && user.email ? <span className="mt-1 flex items-center gap-2 text-sm font-normal"><a href={`mailto:${user.email}`} className="break-all text-primary hover:underline">{user.email}</a><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" /></span> : field === "phone" && user.phone ? <span className="mt-1 flex items-center gap-2 text-sm font-normal"><a href={`tel:${user.phone}`} className="text-primary hover:underline">{user.phone}</a><a href={`tel:${user.phone}`} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-800" aria-label={`Call ${user.phone}`}><Phone className="h-3.5 w-3.5" /></a>{whatsAppUrl && <a href={whatsAppUrl} target="_blank" rel="noreferrer" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-800" aria-label={`Message ${user.phone} on WhatsApp`}><MessageCircle className="h-3.5 w-3.5" /></a>}</span> : <span className="mt-1 block break-words text-sm font-normal text-slate-700 dark:text-slate-200">{(user[field] as string) || "Not provided"}</span>}
                </label>
              ))}
            </div>
          </section>

          <section><h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Conversation</h3><div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800"><div className="flex justify-between"><span className="text-slate-500">Status</span><span>{conversationStatus === "closed" ? "Closed" : "Open"}</span></div><div className="flex justify-between"><span className="text-slate-500">Messages</span><span>{messageCount}</span></div><div className="flex justify-between"><span className="text-slate-500">Joined</span><span>{user.createdAt ? formatDateTime(user.createdAt) : "Unknown"}</span></div><div className="flex justify-between"><span className="text-slate-500">Visitor ID</span><span className="max-w-32 truncate font-mono text-xs" title={user.id}>{user.id}</span></div></div></section>
          <section><h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">All conversations</h3><div className="space-y-2"><button type="button" onClick={onExportAllConversations} className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><Send className="h-4 w-4 text-primary" />Export every conversation</button><button type="button" onClick={onDeleteAllConversations} disabled={!canDeleteHistory} title={!canDeleteHistory ? "End every active chat before deleting history" : undefined} className="flex w-full items-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-red-900/70 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" />Delete every conversation</button><button type="button" onClick={onDeleteUser} disabled={!canDeleteHistory} title={!canDeleteHistory ? "End every active chat before deleting this visitor" : undefined} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-red-600/75 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-45"><Trash2 className="h-3.5 w-3.5" />Delete visitor profile and all history</button>{!canDeleteHistory && <p className="text-xs leading-relaxed text-slate-500">End every active chat before deleting this visitor or their history.</p>}</div></section>
        </div>

        {isEditing && <div className="flex gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button onClick={cancelEditing} disabled={isSaving} className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800">Cancel</button><button onClick={save} disabled={isSaving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{isSaving ? "Saving…" : "Save changes"}</button></div>}
      </aside>
    </div>
  );
}

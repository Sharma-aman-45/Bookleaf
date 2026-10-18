import { redirect } from "next/navigation";

export default function AuthorHome() {
  redirect("/author/books");
}

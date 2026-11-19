// A full navigation (a new document): after sign-in, sign-out and a lost session the next page is
// loaded from the server, so no state of the previous user stays in memory. One place, so the
// component tests can watch it.
export const navigation = {
  assign(url: string): void {
    window.location.assign(url);
  },
};

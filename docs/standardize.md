We will change the UI of Alerting to standardize on the usual look-and-feel
of the sister repos.  Functionality will remain the same. Changes we will make:

1) Settings

At present settings is behind a Cog icon top right. We lose the Cog icon. Instead the top-left Alerting icon becomes clickable for Settings. Settings will be in a Pues InstallDialog (or similar).

2) Top left Alerting icon

This will be smaller and standardized like the other repos ../todos, ../fifos - and it'll have the Pues wiggle behaviour until clicked the first time.

3) There will be a synthetic first item listed in the home page "All Alerts". This will replace the behavior of the Alerting icon as it currently behaves.

4) We will standardize on Pues rows, but keep our red pill alerts count. Dragging left will show "Edit" instead of "Config", but keep the existing dialog for now (except make it a Pues Dialog component).

5) We will not sort the items on the home page, but instead they'll be draggable. Make a migration to add "position" etc. We have Pues "db" for migrations now.

6) Filters: We will have a filter in the topbar, and the Login with Legendum thing top right. We won't have login independent of Legendum. We can show the quota on the Settings page for now, so there's space for the Filter + Legendum in the top bar

7) Filters: We will also have a filter in the detail page. Filter is still at the top of the page - it just filters on alerts instead of webhooks.


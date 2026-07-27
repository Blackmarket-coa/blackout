-- Add created_by to coalition_tasks for object-level authorization on task
-- updates (audit finding M3): PATCH /v1/coalition/tasks/:id previously mutated a
-- task looked up purely by id after only requiring authentication, letting any
-- signed-in user change any den's task status. Nullable so rows created before
-- this column are grandfathered (the app allows updates to those); new tasks
-- always record their creator, and the handler enforces creator/assignee.
ALTER TABLE coalition_tasks ADD COLUMN created_by TEXT;

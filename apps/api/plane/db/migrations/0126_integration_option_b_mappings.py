# Integrations — Option B (webhooks + task-bot) mapping tables (mote) — see
# docs/mote-design/06-integrations-importers-automations.md, Feature 1, §1.3.
#
# Option B reuses the orphan integration tables purely as project↔target maps
# (no OAuth, admin pastes an incoming-webhook URL). This migration only relaxes
# OAuth-only NOT NULL columns and adds a display-only `channel` label so the
# tables can be populated without fabricating WorkspaceIntegration/APIToken rows.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0125_cycle_manual_state"),
    ]

    operations = [
        # --- SlackProjectSync: usable as a plain project↔webhook map ---
        migrations.AddField(
            model_name="slackprojectsync",
            name="channel",
            field=models.CharField(blank=True, default="", max_length=300),
        ),
        migrations.AlterField(
            model_name="slackprojectsync",
            name="access_token",
            field=models.CharField(blank=True, default="", max_length=300),
        ),
        migrations.AlterField(
            model_name="slackprojectsync",
            name="scopes",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="slackprojectsync",
            name="bot_user_id",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.AlterField(
            model_name="slackprojectsync",
            name="team_id",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AlterField(
            model_name="slackprojectsync",
            name="team_name",
            field=models.CharField(blank=True, default="", max_length=300),
        ),
        migrations.AlterField(
            model_name="slackprojectsync",
            name="workspace_integration",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="slack_syncs",
                to="db.workspaceintegration",
            ),
        ),
        # --- GithubRepository: usable as a plain project↔repo map ---
        migrations.AlterField(
            model_name="githubrepository",
            name="repository_id",
            field=models.BigIntegerField(blank=True, null=True),
        ),
    ]

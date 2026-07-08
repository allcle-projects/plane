# Teamspaces (mote) — Team.lead + TeamMember + TeamProject.
# See docs/mote-design/05-teamspaces-access.md, section 1.
# NOTE: the issuetimer one_running_timer_per_user_issue Remove/Add-constraint
# ops that makemigrations drags in (pre-existing model↔migration drift since
# mote.9) are intentionally stripped from this feature migration.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0140_automations'),
    ]

    operations = [
        migrations.CreateModel(
            name='TeamMember',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
            ],
            options={
                'verbose_name': 'Team Member',
                'verbose_name_plural': 'Team Members',
                'db_table': 'team_members',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='TeamProject',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
            ],
            options={
                'verbose_name': 'Team Project',
                'verbose_name_plural': 'Team Projects',
                'db_table': 'team_projects',
                'ordering': ('-created_at',),
            },
        ),
        migrations.AddField(
            model_name='team',
            name='lead',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='led_teams', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='teamproject',
            name='created_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By'),
        ),
        migrations.AddField(
            model_name='teamproject',
            name='project',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='project_team', to='db.project'),
        ),
        migrations.AddField(
            model_name='teamproject',
            name='team',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='team_project', to='db.team'),
        ),
        migrations.AddField(
            model_name='teamproject',
            name='updated_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By'),
        ),
        migrations.AddField(
            model_name='teamproject',
            name='workspace',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_team_project', to='db.workspace'),
        ),
        migrations.AddField(
            model_name='teammember',
            name='created_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By'),
        ),
        migrations.AddField(
            model_name='teammember',
            name='member',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='member_team', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='teammember',
            name='team',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='team_member', to='db.team'),
        ),
        migrations.AddField(
            model_name='teammember',
            name='updated_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By'),
        ),
        migrations.AddField(
            model_name='teammember',
            name='workspace',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_team_member', to='db.workspace'),
        ),
        migrations.AddConstraint(
            model_name='teamproject',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('team', 'project'), name='team_project_unique_team_project_when_deleted_at_null'),
        ),
        migrations.AlterUniqueTogether(
            name='teamproject',
            unique_together={('team', 'project', 'deleted_at')},
        ),
        migrations.AddConstraint(
            model_name='teammember',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('team', 'member'), name='team_member_unique_team_member_when_deleted_at_null'),
        ),
        migrations.AlterUniqueTogether(
            name='teammember',
            unique_together={('team', 'member', 'deleted_at')},
        ),
    ]

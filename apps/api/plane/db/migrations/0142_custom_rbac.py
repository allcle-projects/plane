# Custom RBAC (mote) — Permission catalog + Role + RoleAssignment.
# See docs/mote-design/05-teamspaces-access.md, section 2.
# NOTE: the issuetimer one_running_timer_per_user_issue Remove/Add-constraint
# ops that makemigrations drags in (pre-existing drift since mote.9) are
# intentionally stripped from this feature migration.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid

from plane.utils.rbac_catalog import PERMISSION_CATALOG, SYSTEM_ROLES


def seed_rbac(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    Role = apps.get_model("db", "Role")
    Workspace = apps.get_model("db", "Workspace")

    # 1) Global permission catalog.
    key_to_perm = {}
    for key, category, description in PERMISSION_CATALOG:
        perm, _ = Permission.objects.get_or_create(
            key=key, defaults={"category": category, "description": description}
        )
        key_to_perm[key] = perm

    # 2) Three seeded system roles per existing workspace.
    for workspace in Workspace.objects.all():
        for name, base_role, permission_keys in SYSTEM_ROLES:
            exists = Role.objects.filter(
                workspace=workspace, name=name, deleted_at__isnull=True
            ).first()
            if exists:
                continue
            role = Role.objects.create(
                workspace=workspace,
                name=name,
                level="WORKSPACE",
                is_system=True,
                base_role=base_role,
            )
            role.permissions.set([key_to_perm[k] for k in permission_keys if k in key_to_perm])


def unseed_rbac(apps, schema_editor):
    # Reverse: drop seeded system roles + catalog (custom roles/assignments are
    # removed by the table drops).
    Role = apps.get_model("db", "Role")
    Permission = apps.get_model("db", "Permission")
    Role.objects.filter(is_system=True).delete()
    Permission.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0141_teamspaces'),
    ]

    operations = [
        migrations.CreateModel(
            name='Permission',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('key', models.CharField(max_length=100, unique=True)),
                ('category', models.CharField(max_length=50)),
                ('description', models.TextField(blank=True, default='')),
            ],
            options={
                'verbose_name': 'Permission',
                'verbose_name_plural': 'Permissions',
                'db_table': 'permissions',
                'ordering': ('category', 'key'),
            },
        ),
        migrations.CreateModel(
            name='Role',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True, default='')),
                ('level', models.CharField(choices=[('WORKSPACE', 'Workspace'), ('PROJECT', 'Project')], default='WORKSPACE', max_length=20)),
                ('is_system', models.BooleanField(default=False)),
                ('base_role', models.PositiveSmallIntegerField(blank=True, null=True)),
            ],
            options={
                'verbose_name': 'Role',
                'verbose_name_plural': 'Roles',
                'db_table': 'roles',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='RoleAssignment',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
            ],
            options={
                'verbose_name': 'Role Assignment',
                'verbose_name_plural': 'Role Assignments',
                'db_table': 'role_assignments',
                'ordering': ('-created_at',),
            },
        ),
        migrations.AddField(
            model_name='roleassignment',
            name='created_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By'),
        ),
        migrations.AddField(
            model_name='roleassignment',
            name='member',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='role_assignments', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='roleassignment',
            name='project',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='project_role_assignments', to='db.project'),
        ),
        migrations.AddField(
            model_name='roleassignment',
            name='role',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='db.role'),
        ),
        migrations.AddField(
            model_name='roleassignment',
            name='updated_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By'),
        ),
        migrations.AddField(
            model_name='roleassignment',
            name='workspace',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_role_assignments', to='db.workspace'),
        ),
        migrations.AddField(
            model_name='role',
            name='created_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By'),
        ),
        migrations.AddField(
            model_name='role',
            name='permissions',
            field=models.ManyToManyField(blank=True, related_name='roles', to='db.permission'),
        ),
        migrations.AddField(
            model_name='role',
            name='updated_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By'),
        ),
        migrations.AddField(
            model_name='role',
            name='workspace',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='roles', to='db.workspace'),
        ),
        migrations.AddField(
            model_name='permission',
            name='created_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By'),
        ),
        migrations.AddField(
            model_name='permission',
            name='updated_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By'),
        ),
        migrations.AddConstraint(
            model_name='roleassignment',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('role', 'member', 'project'), name='role_assignment_unique_role_member_project_when_deleted_at_null'),
        ),
        migrations.AlterUniqueTogether(
            name='roleassignment',
            unique_together={('role', 'member', 'project', 'deleted_at')},
        ),
        migrations.AddConstraint(
            model_name='role',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('name', 'workspace'), name='role_unique_name_workspace_when_deleted_at_null'),
        ),
        migrations.AlterUniqueTogether(
            name='role',
            unique_together={('name', 'workspace', 'deleted_at')},
        ),
        migrations.RunPython(seed_rbac, unseed_rbac),
    ]

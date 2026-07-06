# TOTP replay hardening — mote.
# See docs/mote-design/05-teamspaces-access.md, section 3.
#
# Adds a nullable last-accepted TOTP timestep to UserMFA so a captured code
# cannot be replayed inside its ~90s skew window. Additive, nullable column;
# a separate migration (not 0128) so it applies cleanly regardless of whether
# 0128 has already been run in any environment.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0128_usermfa_mfabackupcode"),
    ]

    operations = [
        migrations.AddField(
            model_name="usermfa",
            name="last_verified_timestep",
            field=models.BigIntegerField(blank=True, null=True),
        ),
    ]

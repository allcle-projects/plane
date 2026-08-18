from django.db import migrations, models

# NOTE: 0141/0142/0145 와 같은 방침 — makemigrations 가 끌고 오는 기존
# model<->migration drift(issuetimer 제약 Remove/Add 등, mote.9 이후 누적)는
# 의도적으로 배제하고 이번 스키마 변경만 남긴다.
#
# mote: WorkspaceUserProperties.default_global_view
#   워크스페이스 Views 진입 시 열릴 기본 뷰를 사용자×워크스페이스 단위로 저장한다.
#   기존 행은 NULL 로 남고, NULL 이면 종전대로 all-issues 가 열린다(동작 무변경).


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0145_view_column_order"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspaceuserproperties",
            name="default_global_view",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]

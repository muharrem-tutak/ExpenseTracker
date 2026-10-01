using System.ComponentModel.DataAnnotations;
namespace ExpenseTrackerApi.Dtos;
public class ExpenseRequest : IValidatableObject
{
    [Required, StringLength(100)] public string Title { get; set; } = string.Empty;
    [Range(typeof(decimal), "0.01", "9999999999999999.99", ParseLimitsInInvariantCulture = true, ConvertValueInInvariantCulture = true)] public decimal Amount { get; set; }
    [Required, StringLength(50)] public string Category { get; set; } = string.Empty;
    [Required] public DateOnly? Date { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (decimal.Round(Amount, 2) != Amount)
            yield return new ValidationResult("Tutar en fazla iki ondalık basamak içerebilir.", [nameof(Amount)]);
    }
}
